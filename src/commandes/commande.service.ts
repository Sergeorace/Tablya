import { randomUUID } from 'crypto';
import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { CommandeStatut, LigneStatut, PosteCible, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { JsonLogger } from '../common/json.logger';
import { AuthUser } from '../auth/current-user.decorator';
import { ClientsService } from '../clients/clients.service';
import { getRequestContext } from '../common/als';
import {
  AddLignesDto, AnnulerCommandeDto, CreateCommandeDto, LigneCommandeDto,
  UpdateCommandeStatutDto, UpdateLigneStatutDto,
} from './dto/commande.dto';

type Tx = Prisma.TransactionClient;

/** Transitions autorisées (docs/01 §1.13). */
const TRANSITIONS: Record<CommandeStatut, CommandeStatut[]> = {
  recue: ['en_preparation', 'annulee'],
  en_preparation: ['prete', 'annulee'],
  prete: ['servie', 'annulee'],
  servie: ['cloturee'],
  cloturee: [],
  annulee: [],
};

const LIGNE_TRANSITIONS: Record<LigneStatut, LigneStatut[]> = {
  en_attente: ['envoye_cuisine', 'annulee'],
  envoye_cuisine: ['en_cours', 'annulee'],
  en_cours: ['pret', 'annulee'],
  pret: ['serve', 'annulee'],
  serve: [],
  annulee: [],
};

@Injectable()
export class CommandeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly logger: JsonLogger,
    private readonly clients: ClientsService,
  ) {}

  // ---------------- POS ----------------

  /**
   * Catalogue POS minimal pour la prise de commande staff :
   * places non hors_service + produits actifs avec variantes.
   * Permission `commande.creer` — pas besoin de salle.gerer/catalogue.gerer.
   */
  posCatalogue(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const [places, produits] = await Promise.all([
        tx.place.findMany({
          where: {
            etablissementId: user.etablissementId,
            statut: { not: 'hors_service' },
          },
          select: {
            id: true, numero: true, capacite: true, type: true, statut: true,
            zone: { select: { nom: true } },
          },
          orderBy: { numero: 'asc' },
        }),
        tx.produit.findMany({
          where: { etablissementId: user.etablissementId, actif: true },
          select: {
            id: true, nom: true, description: true, disponible: true,
            categorie: { select: { nom: true } },
            variantes: {
              where: { actif: true },
              orderBy: { prixCentimes: 'asc' },
              select: { id: true, nom: true, prixCentimes: true },
            },
          },
          orderBy: { nom: 'asc' },
        }),
      ]);
      return { places, produits };
    });
  }

  // ---------------- Création (idempotente) ----------------

  async createCommande(user: AuthUser, dto: CreateCommandeDto) {
    // Idempotence : même clé → même commande (retry réseau, double-clic, sync)
    const existing = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.commande.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { lignes: true },
      }),
    );
    if (existing) {
      this.logger.log('commande.idempotent_hit', 'commande.creee', {
        commande_id: existing.id,
      });
      return { ...existing, _deduplicated: true };
    }

    const commande = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const lignesData = await this.buildLignes(tx, user, dto.lignes);
      const total = lignesData.reduce((s, l) => s + l.totalCentimes, 0n);

      let placeLocked = false;
      if (dto.placeId) {
        // Verrouillage atomique : libre|reservee → occupee (anti double scan)
        const res = await tx.place.updateMany({
          where: {
            id: dto.placeId,
            etablissementId: user.etablissementId,
            statut: { in: ['libre', 'reservee'] },
          },
          data: { statut: 'occupee' },
        });
        if (res.count === 0) {
          const place = await tx.place.findFirst({ where: { id: dto.placeId } });
          if (!place) throw new NotFoundException('Place introuvable');
          throw new ConflictException(`La place ${place.numero} n'est pas disponible (${place.statut})`);
        }
        placeLocked = true;
      }

      const created = await tx.commande.create({
        data: {
          tenantId: user.tenantId,
          etablissementId: user.etablissementId,
          placeId: dto.placeId,
          clientId: dto.clientId,
          serveurId: user.userId,
          type: dto.type ?? (dto.placeId ? 'sur_place' : 'emporter'),
          modePaiementPrevu: dto.modePaiementPrevu,
          totalCentimes: total,
          idempotencyKey: dto.idempotencyKey,
          metadataHorsLigne: (dto.metadataHorsLigne ?? undefined) as never,
          lignes: { create: lignesData },
        },
        include: { lignes: true, place: { select: { id: true, numero: true } } },
      });

      if (dto.placeId) {
        await tx.place.update({
          where: { id: dto.placeId },
          data: { commandeActiveId: created.id },
        });
      }
      void placeLocked;
      return created;
    });

    this.realtime.commandeNouvelle(user.tenantId, {
      id: commande.id,
      placeId: commande.placeId,
      totalCentimes: Number(commande.totalCentimes),
    });
    this.logger.log('commande.creee', 'commande.creee', {
      commande_id: commande.id,
      total_centimes: Number(commande.totalCentimes),
      place_id: commande.placeId,
    });
    return commande;
  }

  /** Ajout de lignes sur commande ouverte (B6 — ajouts successifs). */
  async addLignes(user: AuthUser, commandeId: string, dto: AddLignesDto) {
    const result = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const commande = await this.getOwned(tx, user.etablissementId, commandeId);
      this.assertModifiable(commande.statut);

      const lignesData = await this.buildLignes(tx, user, dto.lignes);
      const added = lignesData.reduce((s, l) => s + l.totalCentimes, 0n);

      await tx.ligneCommande.createMany({
        data: lignesData.map((l) => ({ ...l, commandeId, tenantId: user.tenantId })),
      });
      const updated = await tx.commande.update({
        where: { id: commandeId },
        data: { totalCentimes: { increment: added } },
        include: { lignes: true },
      });
      return updated;
    });

    this.realtime.commandeModifiee(user.tenantId, commandeId, { action: 'lignes_ajoutees' });
    return result;
  }

  // ---------------- Lecture ----------------

  listCommandes(user: AuthUser, filters: { statut?: CommandeStatut; placeId?: string }) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.commande.findMany({
        where: {
          etablissementId: user.etablissementId,
          ...(filters.statut ? { statut: filters.statut } : {}),
          ...(filters.placeId ? { placeId: filters.placeId } : {}),
        },
        include: {
          place: { select: { id: true, numero: true, statut: true } },
          lignes: { select: { id: true, statut: true, posteCible: true, quantite: true } },
          client: { select: { id: true, nom: true, telephone: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  getCommande(user: AuthUser, commandeId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const c = await tx.commande.findFirst({
        where: { id: commandeId, etablissementId: user.etablissementId },
        include: {
          lignes: { include: { produit: { select: { nom: true } }, variante: { select: { nom: true } } } },
          place: true,
          client: { select: { id: true, nom: true, telephone: true } },
          transactions: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!c) throw new NotFoundException('Commande introuvable');
      return c;
    });
  }

  /** File KDS : commandes actives avec lignes par poste cible. */
  kdsBoard(user: AuthUser, poste?: PosteCible) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.commande.findMany({
        where: {
          etablissementId: user.etablissementId,
          statut: { in: ['recue', 'en_preparation', 'prete', 'servie'] },
        },
        include: {
          place: { select: { numero: true } },
          lignes: {
            where: {
              statut: { notIn: ['serve', 'annulee'] },
              ...(poste ? { posteCible: poste } : {}),
            },
            include: { produit: { select: { nom: true } }, variante: { select: { nom: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  // ---------------- Transitions ----------------

  async updateCommandeStatut(user: AuthUser, commandeId: string, dto: UpdateCommandeStatutDto) {
    const commande = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const c = await this.getOwned(tx, user.etablissementId, commandeId);
      const allowed = TRANSITIONS[c.statut] ?? [];
      if (!allowed.includes(dto.statut)) {
        throw new BadRequestException(`Transition ${c.statut} → ${dto.statut} non autorisée`);
      }
      return tx.commande.update({ where: { id: commandeId }, data: { statut: dto.statut } });
    });
    this.realtime.commandeStatut(user.tenantId, commandeId, commande.statut, undefined, commande.clientId);
    return commande;
  }

  /** KDS : transition d'une ligne (envoye_cuisine → en_cours → pret → serve). */
  async updateLigneStatut(user: AuthUser, ligneId: string, dto: UpdateLigneStatutDto) {
    const ligne = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const l = await tx.ligneCommande.findFirst({
        where: { id: ligneId },
        include: { commande: { select: { etablissementId: true, statut: true } } },
      });
      if (!l || l.commande.etablissementId !== user.etablissementId) {
        throw new NotFoundException('Ligne introuvable');
      }
      const allowed = LIGNE_TRANSITIONS[l.statut] ?? [];
      if (!allowed.includes(dto.statut)) {
        throw new BadRequestException(`Transition ligne ${l.statut} → ${dto.statut} non autorisée`);
      }
      return tx.ligneCommande.update({ where: { id: ligneId }, data: { statut: dto.statut } });
    });
    this.realtime.commandeModifiee(user.tenantId, ligne.commandeId, { action: 'ligne_statut', ligneId, statut: dto.statut });
    return ligne;
  }

  /** Envoi cuisine/bar : marque les lignes en_attente → envoye_cuisine. */
  async envoyerEnProduction(user: AuthUser, commandeId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const c = await this.getOwned(tx, user.etablissementId, commandeId);
      if (c.statut !== 'recue') throw new BadRequestException('Commande déjà envoyée en production');
      await tx.ligneCommande.updateMany({
        where: { commandeId, statut: 'en_attente' },
        data: { statut: 'envoye_cuisine' },
      });
      return tx.commande.update({ where: { id: commandeId }, data: { statut: 'en_preparation' } });
    }).then((c) => {
      this.realtime.commandeStatut(user.tenantId, commandeId, 'en_preparation', { action: 'envoye_cuisine' }, c.clientId);
      return c;
    });
  }

  // ---------------- Annulation (auditée) ----------------

  async annulerCommande(user: AuthUser, commandeId: string, dto: AnnulerCommandeDto) {
    const commande = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const c = await this.getOwned(tx, user.etablissementId, commandeId);
      const allowed = TRANSITIONS[c.statut] ?? [];
      if (!allowed.includes('annulee')) {
        throw new BadRequestException(`Impossible d'annuler une commande ${c.statut}`);
      }

      const avant = { statut: c.statut, totalCentimes: Number(c.totalCentimes) };
      const updated = await tx.commande.update({
        where: { id: commandeId },
        data: { statut: 'annulee' },
      });
      await tx.ligneCommande.updateMany({
        where: { commandeId, statut: { not: 'serve' } },
        data: { statut: 'annulee' },
      });

      // Libération de la place si plus de commande active
      if (c.placeId) {
        await this.releasePlaceIfIdle(tx, user.etablissementId, c.placeId);
      }

      const ctx = getRequestContext();
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          utilisateurId: user.userId,
          etablissementId: user.etablissementId,
          action: 'commande.annuler',
          entiteType: 'commande',
          entiteId: commandeId,
          avant: avant as never,
          apres: { statut: 'annulee' } as never,
          motif: dto.motif,
          requestId: ctx?.requestId,
        },
      });
      return updated;
    });

    this.realtime.commandeStatut(user.tenantId, commandeId, 'annulee', { motif: dto.motif }, commande.clientId);
    this.logger.log('commande.annulee', 'commande.annuler', { commande_id: commandeId });
    return commande;
  }

  // ---------------- Encaissement espèces (caisse D5) ----------------

  /**
   * Encaissement espèces : crée une transaction interne `especes`
   * reussie + clôture la commande + place → nettoyage.
   * Les paiements dématérialisés passent par svc-paiement (E4).
   */
  async encaisserEspeces(user: AuthUser, commandeId: string) {
    const { commande, transaction } = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const c = await this.getOwned(tx, user.etablissementId, commandeId);
      if (!['servie', 'prete'].includes(c.statut)) {
        throw new BadRequestException(`Impossible d'encaisser une commande ${c.statut}`);
      }
      // Idempotence : une seule transaction especes réussie par commande
      const deja = await tx.transaction.findFirst({
        where: { commandeId, fournisseur: 'especes', statut: 'reussie' },
      });
      if (deja) throw new ConflictException('Commande déjà encaissée');

      const portefeuille = await tx.portefeuille.findUnique({
        where: { etablissementId: user.etablissementId },
      });

      const transaction = await tx.transaction.create({
        data: {
          tenantId: user.tenantId,
          etablissementId: user.etablissementId,
          commandeId,
          portefeuilleId: portefeuille?.id,
          fournisseur: 'especes',
          type: 'paiement',
          statut: 'reussie',
          montantCentimes: c.totalCentimes,
          idempotencyKey: randomUUID(),
          confirmedAt: new Date(),
        },
      });

      const updated = await tx.commande.update({
        where: { id: commandeId },
        data: { statut: 'cloturee' },
      });

      if (c.placeId) {
        await tx.place.updateMany({
          where: { id: c.placeId, commandeActiveId: commandeId },
          data: { statut: 'nettoyage', commandeActiveId: null },
        });
      }
      await this.clients.awardPoints(tx, user.tenantId, user.etablissementId, c.clientId, c.totalCentimes);
      return { commande: updated, transaction };
    });

    this.realtime.commandeStatut(user.tenantId, commandeId, 'cloturee', { mode: 'especes' }, commande.clientId);
    this.logger.log('caisse.encaissement', 'caisse.encaisser', {
      commande_id: commandeId,
      montant_centimes: Number(transaction.montantCentimes),
    });
    return { commande, transaction };
  }

  // ---------------- Helpers ----------------

  private async getOwned(tx: Tx, etablissementId: string, commandeId: string) {
    const c = await tx.commande.findFirst({ where: { id: commandeId, etablissementId } });
    if (!c) throw new NotFoundException('Commande introuvable');
    return c;
  }

  private assertModifiable(statut: CommandeStatut) {
    if (!['recue', 'en_preparation'].includes(statut)) {
      throw new BadRequestException(`Commande non modifiable (${statut})`);
    }
  }

  /** Prix calculés côté serveur depuis les variantes — jamais depuis le client. */
  private async buildLignes(tx: Tx, user: AuthUser, lignes: LigneCommandeDto[]) {
    const data = [];
    for (const l of lignes) {
      const produit = await tx.produit.findFirst({
        where: { id: l.produitId, etablissementId: user.etablissementId, actif: true, disponible: true },
        include: { variantes: { where: { actif: true } } },
      });
      if (!produit) throw new NotFoundException(`Produit ${l.produitId} indisponible`);

      const variante = l.varianteId
        ? produit.variantes.find((v) => v.id === l.varianteId)
        : produit.variantes[0];
      if (!variante) throw new BadRequestException('Variante introuvable pour ce produit');

      data.push({
        tenantId: user.tenantId,
        produitId: produit.id,
        varianteId: variante.id,
        quantite: l.quantite,
        prixUnitaireCentimes: variante.prixCentimes,
        totalCentimes: variante.prixCentimes * BigInt(l.quantite),
        supplements: (l.supplements ?? undefined) as never,
        posteCible: l.posteCible ?? 'cuisine',
        statut: 'en_attente' as LigneStatut,
      });
    }
    return data;
  }

  /** Libère la place si aucune commande active ne la référence. */
  private async releasePlaceIfIdle(tx: Tx, etablissementId: string, placeId: string) {
    const active = await tx.commande.count({
      where: {
        placeId,
        etablissementId,
        statut: { in: ['recue', 'en_preparation', 'prete', 'servie'] },
      },
    });
    if (active === 0) {
      const place = await tx.place.findFirst({ where: { id: placeId } });
      if (place && !['nettoyage', 'hors_service'].includes(place.statut)) {
        await tx.place.update({ where: { id: placeId }, data: { statut: 'libre', commandeActiveId: null } });
      }
    }
  }
}
