import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import { CommandeStatut, FournisseurPaiement, Prisma, TransactionStatut, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { JsonLogger } from '../common/json.logger';
import { getRequestContext } from '../common/als';
import { AuthUser } from '../auth/current-user.decorator';
import {
  PaymentProvider, MoyenPaiement, WebhookEvent,
} from './providers/payment-provider.interface';
import { FedapayProvider } from './providers/fedapay.provider';
import { CinetpayProvider } from './providers/cinetpay.provider';
import { InitierPaiementDto, PartageDto } from './dto/paiement.dto';
import { ClientsService } from '../clients/clients.service';

type Tx = Prisma.TransactionClient;

export const PAYMENT_QUEUE = 'payment';
export const PAYMENT_CONFIRM_JOB = 'payment.confirm';

/** Taux de commission plateforme par plan — à ajuster commercialement (E8). */
const COMMISSION_RATES: Record<string, number> = {
  starter: 0.03,
  pro: 0.02,
  entreprise: 0.015,
};
/** Estimation frais fournisseur en % — à remplacer par les grilles réelles. */
const FRAIS_FOURNISSEUR: Record<string, number> = {
  fedapay: 0.01,
  cinetpay: 0.012,
};

/** Routage moyen → fournisseurs par priorité (US-4.2, bascule en cas d'échec). */
const ROUTING: Record<MoyenPaiement, FournisseurPaiement[]> = {
  tmoney: ['fedapay', 'cinetpay'],
  moov: ['fedapay', 'cinetpay'],
  flooz: ['fedapay', 'cinetpay'],
  carte: ['cinetpay', 'fedapay'],
  especes: [],
  virement: [],
};

const TERMES = ['reussie', 'echouee', 'expiree', 'annulee', 'remboursee'];

@Injectable()
export class PaiementService {
  private readonly logger = new Logger('PaiementService');
  private readonly providers = new Map<FournisseurPaiement, PaymentProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly jsonLogger: JsonLogger,
    private readonly fedapay: FedapayProvider,
    private readonly cinetpay: CinetpayProvider,
    private readonly clients: ClientsService,
    @InjectQueue(PAYMENT_QUEUE) private readonly paymentQueue: Queue,
  ) {
    this.providers.set('fedapay', fedapay);
    this.providers.set('cinetpay', cinetpay);
  }

  // ---------------- Initiation ----------------

  /**
   * Initie un paiement dématérialisé sur une commande (B7 / US-4.1).
   * - idempotent par `idempotencyKey` (retry réseau, double-clic)
   * - `transaction` créée AVANT l'appel fournisseur : notre id sert de
   *   référence interne, `referenceExterne` = référence fournisseur
   * - routage par moyen + bascule fournisseur en cas d'échec (US-4.2)
   */
  async initierPaiement(user: AuthUser, commandeId: string, dto: InitierPaiementDto) {
    const existing = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.transaction.findUnique({ where: { idempotencyKey: dto.idempotencyKey } }),
    );
    if (existing) {
      this.jsonLogger.log('payment.idempotent_hit', 'payment.initiate', {
        transaction_id: existing.id,
      });
      return { transaction: existing, _deduplicated: true };
    }

    // Phase 1 : transaction DB (pas d'appel réseau dans la transaction)
    const prepared = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const commande = await tx.commande.findFirst({
        where: { id: commandeId, etablissementId: user.etablissementId },
        include: { client: true },
      });
      if (!commande) throw new NotFoundException('Commande introuvable');
      if (['cloturee', 'annulee'].includes(commande.statut)) {
        throw new ConflictException(`Commande ${commande.statut} — non payable`);
      }

      const etab = await tx.etablissement.findUniqueOrThrow({
        where: { id: user.etablissementId },
        include: { abonnements: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      let portefeuille = await tx.portefeuille.findUnique({
        where: { etablissementId: user.etablissementId },
      });
      if (!portefeuille) {
        portefeuille = await tx.portefeuille.create({
          data: { tenantId: user.tenantId, etablissementId: user.etablissementId },
        });
      }

      // Montant : total + pourboire par défaut ; montantCentimes explicite
      // pour les parts de partage (US-4.3).
      const montant = dto.montantCentimes != null
        ? BigInt(dto.montantCentimes)
        : commande.totalCentimes + BigInt(dto.pourboireCentimes ?? 0);
      if (montant <= 0n) throw new BadRequestException('Montant invalide');
      const plan = etab.abonnements[0]?.plan ?? 'starter';
      const commissionRate = COMMISSION_RATES[plan] ?? COMMISSION_RATES.starter;
      const commission = BigInt(Math.round(Number(montant) * commissionRate));

      const transaction = await tx.transaction.create({
        data: {
          tenantId: user.tenantId,
          etablissementId: user.etablissementId,
          commandeId,
          portefeuilleId: portefeuille.id,
          fournisseur: 'fedapay', // provisoire — remplacé après routage
          type: 'paiement',
          statut: 'initiee',
          montantCentimes: montant,
          devise: etab.devise,
          idempotencyKey: dto.idempotencyKey,
          commissionPlateformeCentimes: commission,
        },
      });
      await tx.paymentEvent.create({
        data: {
          tenantId: user.tenantId,
          transactionId: transaction.id,
          fournisseur: 'fedapay',
          type: 'initiate',
          statut: 'received',
        },
      });
      return { transaction, commande, etab };
    });

    // Phase 2 : appel fournisseur hors transaction DB
    const chosen = await this.routeAndInitiate(dto.moyen, {
      transactionId: prepared.transaction.id,
      montantCentimes: Number(prepared.transaction.montantCentimes),
      devise: prepared.etab.devise,
      moyen: dto.moyen,
      description: `Tablya commande ${commandeId.slice(0, 8)}`,
      clientPhone: dto.clientPhone ?? prepared.commande.client?.telephone ?? undefined,
      clientEmail: dto.clientEmail,
      metadata: { tenant_id: user.tenantId, commande_id: commandeId },
    });

    // Phase 3 : référence externe + frais + net
    const finalTx = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const fraisRate = FRAIS_FOURNISSEUR[chosen.provider.name] ?? 0;
      const frais = BigInt(Math.round(Number(prepared.transaction.montantCentimes) * fraisRate));
      const net = prepared.transaction.montantCentimes
        - prepared.transaction.commissionPlateformeCentimes - frais;
      return tx.transaction.update({
        where: { id: prepared.transaction.id },
        data: {
          fournisseur: chosen.provider.name,
          referenceExterne: chosen.result.referenceExterne,
          statut: 'en_attente',
          fraisFournisseurCentimes: frais,
          netEtablissementCentimes: net,
          reponseFournisseur: (chosen.result.raw ?? {}) as never,
        },
      });
    });

    this.jsonLogger.log('payment.initiated', 'payment.initiate', {
      transaction_id: finalTx.id,
      fournisseur: finalTx.fournisseur,
      montant_centimes: Number(finalTx.montantCentimes),
    });
    return { transaction: finalTx, instructions: chosen.result.instructions };
  }

  /**
   * Paiement fractionné (US-4.3) : crée une transaction + PartagePaiement
   * par convive. La commande n'est clôturée que quand la somme des
   * transactions `reussie` ≥ total (voir confirmTransaction).
   */
  async initierPaiementsPartages(user: AuthUser, commandeId: string, parts: PartageDto[]) {
    if (parts.length === 0) throw new BadRequestException('Aucun partage fourni');

    // Répartition équitable si montants non fournis (dernier = reliquat)
    const commande = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.commande.findFirst({ where: { id: commandeId, etablissementId: user.etablissementId } }),
    );
    if (!commande) throw new NotFoundException('Commande introuvable');
    const total = Number(commande.totalCentimes);
    const fixee = parts.reduce((s, p) => s + (p.montantCentimes ?? 0), 0);
    const nbLibres = parts.filter((p) => p.montantCentimes == null).length;
    const partEgale = nbLibres > 0 ? Math.floor((total - fixee) / nbLibres) : 0;
    // Le dernier partage libre absorbe le reliquat d'arrondi
    const montants: number[] = [];
    let libresVus = 0;
    for (const p of parts) {
      if (p.montantCentimes != null) { montants.push(p.montantCentimes); continue; }
      libresVus += 1;
      montants.push(libresVus === nbLibres ? total - fixee - partEgale * (nbLibres - 1) : partEgale);
    }

    const results = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const montant = montants[i];
      const r = await this.initierPaiement(user, commandeId, {
        moyen: part.moyen,
        montantCentimes: montant,
        idempotencyKey: part.idempotencyKey ?? randomUUID(),
        clientPhone: part.clientPhone,
      });
      await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.partagePaiement.create({
          data: {
            tenantId: user.tenantId,
            transactionId: r.transaction.id,
            libelle: part.libelle ?? 'convive',
            montantCentimes: BigInt(montant),
          },
        }),
      );
      results.push(r);
    }
    return { parts: results };
  }

  /** Routage par priorité + bascule si fournisseur en échec. */
  private async routeAndInitiate(
    moyen: MoyenPaiement,
    input: Parameters<PaymentProvider['initiate']>[0],
  ) {
    const candidates = ROUTING[moyen] ?? [];
    let lastError: unknown;
    for (const name of candidates) {
      const provider = this.providers.get(name);
      if (!provider || !provider.supportedMoyens.includes(moyen)) continue;
      try {
        const result = await provider.initiate(input);
        return { provider, result };
      } catch (e) {
        lastError = e;
        this.jsonLogger.warn('payment.provider.failed', 'payment.route', {
          fournisseur: name, moyen, error: String(e),
        });
      }
    }
    throw new BadRequestException(`Aucun fournisseur disponible pour ${moyen}: ${String(lastError)}`);
  }

  // ---------------- Webhooks ----------------

  /**
   * Webhook fournisseur (PUBLIC, signature vérifiée par le provider).
   * Enregistre `payment_event` (idempotent) puis enqueue la confirmation.
   * Ne jamais faire confiance au corps sans signature valide.
   */
  async handleWebhook(
    fournisseur: FournisseurPaiement,
    headers: Record<string, unknown>,
    rawBody: string,
  ): Promise<WebhookEvent | null> {
    const provider = this.providers.get(fournisseur);
    if (!provider) throw new NotFoundException('Fournisseur inconnu');

    const event = await provider.parseWebhook(headers, rawBody);
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');

    if (!event || !event.referenceExterne) {
      this.jsonLogger.error('payment.webhook.signature_invalid', undefined, 'payment.webhook', {
        fournisseur, payload_hash: payloadHash,
      });
      return null;
    }

    // Lookup cross-tenant : le webhook ne porte pas de JWT.
    // On résout le tenant depuis la transaction, puis on repasse par withTenant (RLS).
    const txRow = await this.prisma.platform((tx) =>
      tx.transaction.findFirst({ where: { referenceExterne: event.referenceExterne, fournisseur } }),
    );
    if (!txRow) {
      this.jsonLogger.warn('payment.webhook.unknown_reference', 'payment.webhook', {
        fournisseur, reference_externe: event.referenceExterne,
      });
      return event;
    }

    // Idempotence webhook : doublon → on n'enqueue pas
    const isDuplicate = await this.prisma.withTenant(txRow.tenantId, async (tx) => {
      const existing = await tx.paymentEvent.findFirst({
        where: {
          transactionId: txRow.id, fournisseur, type: 'webhook',
          payloadHash, statut: { in: ['received', 'processed'] },
        },
      });
      if (existing) return true;
      await tx.paymentEvent.create({
        data: {
          tenantId: txRow.tenantId,
          transactionId: txRow.id,
          fournisseur,
          type: 'webhook',
          referenceExterne: event.referenceExterne,
          payloadHash,
          statut: 'received',
          httpStatus: 200,
        },
      });
      return false;
    });

    if (!isDuplicate) {
      await this.paymentQueue.add(PAYMENT_CONFIRM_JOB, {
        transactionId: txRow.id,
        statut: event.statut,
        montantCentimes: event.montantCentimes,
      });
    }
    return event;
  }

  // ---------------- Confirmation (worker BullMQ) ----------------

  /**
   * Applique la transition d'état — idempotent par statut terminal.
   * Appelé par le processor ; jamais depuis une requête HTTP directe.
   */
  async confirmTransaction(transactionId: string, statut: string) {
    // Résolution tenant (plateforme) puis mutation scopée RLS
    const tenantId = await this.prisma.platform(async (tx) => {
      const t = await tx.transaction.findUnique({ where: { id: transactionId } });
      return t?.tenantId ?? null;
    });
    if (!tenantId) return { skipped: true };

    const result = await this.prisma.withTenant(tenantId, async (tx) => {
      const t = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: { commande: { include: { place: true } } },
      });
      if (!t) return { skipped: true };
      if (TERMES.includes(t.statut)) return { skipped: true, statut: t.statut };

      const statutMap: Record<string, TransactionStatut> = {
        reussie: t.type === 'refund' ? 'remboursee' : 'reussie',
        echouee: 'echouee',
        expiree: 'expiree',
        annulee: 'annulee',
      };
      const newStatut = statutMap[statut];
      if (!newStatut) return { skipped: true, statut: t.statut };

      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          statut: newStatut,
          confirmedAt: ['reussie', 'remboursee'].includes(newStatut) ? new Date() : undefined,
        },
      });

      // Marquer les payment_events webhook comme processed
      await tx.paymentEvent.updateMany({
        where: { transactionId, type: 'webhook', statut: 'received' },
        data: { statut: 'processed' },
      });

      if (newStatut === 'reussie' && t.type === 'paiement' && t.commandeId) {
        await this.applyPaiementReussi(tx, t, updated);
      }
      if (newStatut === 'remboursee' && t.type === 'refund' && t.commandeId) {
        await this.applyRefundReussi(tx, t, updated);
      }
      return { skipped: false, statut: newStatut, transaction: updated, commandeId: t.commandeId };
    });

    if (!result.skipped && result.transaction) {
      if (result.commandeId) {
        const commande = await this.prisma.withTenant(tenantId, (tx) =>
          tx.commande.findUnique({ where: { id: result.commandeId! } }),
        );
        if (commande) {
          this.realtime.commandeStatut(tenantId, commande.id, commande.statut, {
            paiement: result.statut,
            transaction_id: transactionId,
          });
        }
      }
      this.jsonLogger.log('payment.confirmed', 'payment.confirm', {
        transaction_id: transactionId,
        statut: result.statut,
        type: result.transaction.type,
      });
    }
    return result;
  }

  /** Paiement réussi : clôture si total couvert, crédite le portefeuille. */
  private async applyPaiementReussi(tx: Tx, t: { id: string; commandeId: string | null; portefeuilleId: string | null; netEtablissementCentimes: bigint; montantCentimes: bigint }, updated: { netEtablissementCentimes: bigint }) {
    const commande = await tx.commande.findUnique({ where: { id: t.commandeId! } });
    if (!commande) return;

    // Split payment : somme des transactions réussies ≥ total → clôture
    const paid = await tx.transaction.aggregate({
      where: { commandeId: t.commandeId!, type: 'paiement', statut: 'reussie' },
      _sum: { montantCentimes: true },
    });
    const totalPaye = paid._sum.montantCentimes ?? 0n;
    const couvert = totalPaye >= commande.totalCentimes;

    if (couvert && !['cloturee', 'annulee'].includes(commande.statut)) {
      await tx.commande.update({ where: { id: commande.id }, data: { statut: 'cloturee' } });
      await this.clients.awardPoints(tx, commande.tenantId, commande.etablissementId, commande.clientId, commande.totalCentimes);
      if (commande.placeId) {
        await tx.place.updateMany({
          where: { id: commande.placeId, commandeActiveId: commande.id },
          data: { statut: 'nettoyage', commandeActiveId: null },
        });
      }
    }

    // Crédit portefeuille : net de commission + frais fournisseur
    if (t.portefeuilleId && updated.netEtablissementCentimes > 0n) {
      await tx.portefeuille.update({
        where: { id: t.portefeuilleId },
        data: { soldeCentimes: { increment: updated.netEtablissementCentimes } },
      });
    }
  }

  /** Remboursement confirmé : clawback du net crédité (proportionnel). */
  private async applyRefundReussi(tx: Tx, t: { commandeId: string | null; portefeuilleId: string | null; montantCentimes: bigint }, updated: { montantCentimes: bigint }) {
    if (!t.portefeuilleId) return;
    // Clawback proportionnel : on récupère la part nette du montant remboursé.
    // Approximation MVP : débit du montant remboursé (commission non restituée
    // → TODO raffiner avec la grille réelle du fournisseur).
    const clawback = updated.montantCentimes;
    await tx.portefeuille.update({
      where: { id: t.portefeuilleId },
      data: { soldeCentimes: { decrement: clawback } },
    });
    this.jsonLogger.log('payment.refund.clawback', 'payment.refund', {
      portefeuille_id: t.portefeuilleId,
      clawback_centimes: Number(clawback),
    });
  }

  // ---------------- Consultation ----------------

  listTransactions(user: AuthUser, filters: { statut?: TransactionStatut; fournisseur?: FournisseurPaiement }) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.transaction.findMany({
        where: {
          etablissementId: user.etablissementId,
          ...(filters.statut ? { statut: filters.statut } : {}),
          ...(filters.fournisseur ? { fournisseur: filters.fournisseur } : {}),
        },
        include: { commande: { select: { id: true, statut: true, totalCentimes: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  getPortefeuille(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      let p = await tx.portefeuille.findUnique({ where: { etablissementId: user.etablissementId } });
      if (!p) {
        p = await tx.portefeuille.create({
          data: { tenantId: user.tenantId, etablissementId: user.etablissementId },
        });
      }
      return p;
    });
  }

  // ---------------- Remboursement ----------------

  /**
   * Initie un remboursement (US : E4). Audit obligatoire avec motif.
   * La confirmation effective arrive par webhook (statut `remboursee`).
   */
  async initierRemboursement(user: AuthUser, transactionId: string, dto: { montantCentimes?: number; motif: string }) {
    const { refund, original } = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const original = await tx.transaction.findFirst({
        where: { id: transactionId, etablissementId: user.etablissementId, statut: 'reussie' },
      });
      if (!original) throw new NotFoundException('Transaction remboursable introuvable');

      const montant = BigInt(dto.montantCentimes ?? Number(original.montantCentimes));
      if (montant <= 0n || montant > original.montantCentimes) {
        throw new BadRequestException('Montant de remboursement invalide');
      }

      const ctx = getRequestContext();
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          utilisateurId: user.userId,
          etablissementId: user.etablissementId,
          action: 'transaction.rembourser',
          entiteType: 'transaction',
          entiteId: transactionId,
          avant: { statut: 'reussie', montantCentimes: Number(original.montantCentimes) } as never,
          motif: dto.motif,
          requestId: ctx?.requestId,
        },
      });

      return {
        refund: await tx.transaction.create({
          data: {
            tenantId: user.tenantId,
            etablissementId: user.etablissementId,
            commandeId: original.commandeId,
            portefeuilleId: original.portefeuilleId,
            fournisseur: original.fournisseur,
            type: 'refund',
            statut: 'initiee',
            montantCentimes: montant,
            idempotencyKey: randomUUID(),
          },
        }),
        original,
      };
    });

    // Appel fournisseur si dématérialisé
    if (original.fournisseur !== 'especes' && original.fournisseur !== 'virement') {
      const provider = this.providers.get(original.fournisseur);
      if (provider && original.referenceExterne) {
        const res = await provider.refund(original.referenceExterne, Number(refund.montantCentimes));
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.transaction.update({
            where: { id: refund.id },
            data: { referenceExterne: res.referenceExterne, statut: 'en_attente' },
          }),
        );
      } else {
        await this.prisma.withTenant(user.tenantId, (tx) =>
          tx.transaction.update({ where: { id: refund.id }, data: { statut: 'en_attente' } }),
        );
      }
    } else {
      // Remboursement espèces : immédiat
      await this.prisma.withTenant(user.tenantId, async (tx) => {
        await tx.transaction.update({
          where: { id: refund.id },
          data: { statut: 'remboursee', confirmedAt: new Date() },
        });
        if (refund.portefeuilleId) {
          await tx.portefeuille.update({
            where: { id: refund.portefeuilleId },
            data: { soldeCentimes: { decrement: refund.montantCentimes } },
          });
        }
      });
    }

    this.jsonLogger.log('payment.refund.initiated', 'payment.refund', {
      transaction_id: refund.id, original_id: original.id,
    });
    return refund;
  }

  // ---------------- Reversements (J+1) ----------------

  /**
   * Planifie les reversements J+1 pour les portefeuilles créditeurs.
   * Cron quotidien — la désactivation se fait via SCHEDULE_DISABLED env.
   */
  @Cron('0 3 * * *')
  async planifierReversements() {
    if (process.env.SCHEDULE_DISABLED === 'true') return;
    const portefeuilles = await this.prisma.platform((tx) =>
      tx.portefeuille.findMany({
        where: { soldeCentimes: { gt: 0n } },
        include: { etablissement: { select: { tenantId: true } } },
      }),
    );
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    demain.setHours(6, 0, 0, 0);

    for (const p of portefeuilles) {
      const tenantId = p.etablissement.tenantId;
      await this.prisma.withTenant(tenantId, async (tx) => {
        const exists = await tx.reversement.findFirst({
          where: { portefeuilleId: p.id, statut: { in: ['planifie', 'en_cours'] } },
        });
        if (exists) return;
        await tx.reversement.create({
          data: {
            tenantId,
            portefeuilleId: p.id,
            montantCentimes: p.soldeCentimes,
            statut: 'planifie',
            mode: 'lot',
            destination: 'mobile_money',
            executeAt: demain,
          },
        });
        await tx.portefeuille.update({
          where: { id: p.id },
          data: { soldeCentimes: 0n }, // fonds réservés au reversement
        });
      });
    }
    this.logger.log(`Reversements planifiés: ${portefeuilles.length}`);
  }

  /** Exécute un reversement planifié via le fournisseur (payout). */
  async executerReversement(user: AuthUser, reversementId: string, destination: string) {
    const r = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const rev = await tx.reversement.findFirst({
        where: { id: reversementId, statut: 'planifie' },
        include: { portefeuille: true },
      });
      if (!rev) throw new NotFoundException('Reversement introuvable ou déjà traité');
      return tx.reversement.update({
        where: { id: rev.id },
        data: { statut: 'en_cours' },
      });
    });

    const provider = this.fedapay; // payout via FedaPay par défaut (CinetPay: non supporté)
    try {
      const res = await provider.payout({
        referenceExterne: r.id,
        montantCentimes: Number(r.montantCentimes),
        destination,
        metadata: { tenant_id: user.tenantId },
      });
      await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.reversement.update({
          where: { id: r.id },
          data: { statut: 'reussi', referenceExterne: res.referenceExterne, completedAt: new Date() },
        }),
      );
    } catch (e) {
      await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.reversement.update({
          where: { id: r.id },
          data: { statut: 'echoue' },
        }),
      );
      throw e;
    }
    return r;
  }

  listReversements(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.reversement.findMany({
        where: { portefeuille: { etablissementId: user.etablissementId } },
        orderBy: { executeAt: 'desc' },
        take: 100,
      }),
    );
  }
}
