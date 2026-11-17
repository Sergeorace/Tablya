import { calculerBulletin } from './calcul-paie';
import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JsonLogger } from '../common/json.logger';
import {
  GenererBulletinsDto, ListerBulletinsQuery, ListerPaiementsQuery,
  MajBulletinDto, PayerBulletinDto, ParametresPaieDto,
} from './dto/paie.dto';

const BULLETIN_STATUTS = ['brouillon', 'valide', 'approuve', 'paye', 'annule'] as const;

@Injectable()
export class PaieService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  private async audit(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    action: string,
    entiteId: string,
    motif: string | undefined,
    avant?: unknown,
    apres?: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        utilisateurId: user.userId,
        etablissementId: user.etablissementId,
        action,
        entiteType: 'bulletin_paie',
        entiteId,
        motif: motif ?? null,
        ...(avant !== undefined ? { avant: avant as never } : {}),
        ...(apres !== undefined ? { apres: apres as never } : {}),
      },
    });
  }

  // ---------- Paramètres ----------

  async getParametres(user: AuthUser) {
    const p = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.parametrePaie.findUnique({ where: { tenantId: user.tenantId } }),
    );
    return p ?? {
      cotisationSalarialeBp: 0, impotBp: 0, heuresSupBp: 5000, minutesMensuelles: 12480,
    };
  }

  async setParametres(user: AuthUser, dto: ParametresPaieDto) {
    const p = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const upsert = await tx.parametrePaie.upsert({
        where: { tenantId: user.tenantId },
        update: {
          cotisationSalarialeBp: dto.cotisationSalarialeBp,
          impotBp: dto.impotBp,
          heuresSupBp: dto.heuresSupBp,
          ...(dto.minutesMensuelles !== undefined
            ? { minutesMensuelles: dto.minutesMensuelles } : {}),
        },
        create: {
          tenantId: user.tenantId,
          cotisationSalarialeBp: dto.cotisationSalarialeBp,
          impotBp: dto.impotBp,
          heuresSupBp: dto.heuresSupBp,
          minutesMensuelles: dto.minutesMensuelles ?? 12480,
        },
      });
      await this.audit(tx, user, 'paie.parametres', 'parametre_paie', undefined, undefined, {
        cotisationSalarialeBp: upsert.cotisationSalarialeBp,
        impotBp: upsert.impotBp,
        heuresSupBp: upsert.heuresSupBp,
      });
      return upsert;
    });
    return p;
  }

  // ---------- Calcul ----------

  // ---------- Génération ----------

  /** Génère les bulletins brouillon d'une période — idempotent via @@unique. */
  async generer(user: AuthUser, dto: GenererBulletinsDto) {
    const params = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.parametrePaie.findUnique({ where: { tenantId: user.tenantId } }),
    );
    const taux = params ?? {
      cotisationSalarialeBp: 0, impotBp: 0, heuresSupBp: 5000, minutesMensuelles: 12480,
    };
    const result = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const employes = await tx.employe.findMany({
        where: {
          etablissementId: user.etablissementId,
          salaireBaseCentimes: { not: null },
          ...(dto.employeIds?.length ? { id: { in: dto.employeIds } } : {}),
        },
      });
      let crees = 0, ignores = 0, sansSalaire = 0;
      for (const e of employes) {
        const existant = await tx.bulletinPaie.findUnique({
          where: {
            tenantId_employeId_periodeAnnee_periodeMois: {
              tenantId: user.tenantId,
              employeId: e.id,
              periodeAnnee: dto.annee,
              periodeMois: dto.mois,
            },
          },
        });
        if (existant && existant.statut !== 'brouillon') { ignores++; continue; }
        const calc = calculerBulletin(e.salaireBaseCentimes!, taux, {});
        await tx.bulletinPaie.upsert({
          where: {
            tenantId_employeId_periodeAnnee_periodeMois: {
              tenantId: user.tenantId,
              employeId: e.id,
              periodeAnnee: dto.annee,
              periodeMois: dto.mois,
            },
          },
          update: calc,
          create: {
            tenantId: user.tenantId,
            employeId: e.id,
            periodeAnnee: dto.annee,
            periodeMois: dto.mois,
            ...calc,
          },
        });
        crees++;
      }
      // Employés sans salaire de base : comptés, pas de bulletin.
      const total = await tx.employe.count({
        where: {
          etablissementId: user.etablissementId,
          salaireBaseCentimes: null,
          ...(dto.employeIds?.length ? { id: { in: dto.employeIds } } : {}),
        },
      });
      sansSalaire = total;
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          utilisateurId: user.userId,
          etablissementId: user.etablissementId,
          action: 'paie.generer',
          entiteType: 'periode',
          entiteId: `${dto.annee}-${String(dto.mois).padStart(2, '0')}`,
          apres: { crees, ignores, sans_salaire: sansSalaire } as never,
        },
      });
      return { crees, ignores, sans_salaire: sansSalaire };
    });
    this.logger.log('paie.generer', 'paie.bulletins', {
      tenant_id: user.tenantId, annee: dto.annee, mois: dto.mois, ...result,
    });
    return result;
  }

  // ---------- Consultation ----------

  async lister(user: AuthUser, query: ListerBulletinsQuery) {
    const statut = query.statut && BULLETIN_STATUTS.includes(query.statut as never)
      ? query.statut : undefined;
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.bulletinPaie.findMany({
        where: {
          tenantId: user.tenantId,
          periodeAnnee: query.annee,
          periodeMois: query.mois,
          ...(statut ? { statut: statut as never } : {}),
          employe: { etablissementId: user.etablissementId },
        },
        include: {
          employe: { select: { id: true, nom: true, prenom: true, poste: true } },
          paiementsSalaire: { select: { id: true, statut: true, montantCentimes: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async get(user: AuthUser, id: string) {
    const b = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.bulletinPaie.findFirst({
        where: { id, employe: { etablissementId: user.etablissementId } },
        include: {
          employe: true,
          paiementsSalaire: true,
        },
      }),
    );
    if (!b) throw new NotFoundException('Bulletin introuvable');
    return b;
  }

  /** Mise à jour primes/retenues/HS — brouillon uniquement, recalcule tout. */
  async maj(user: AuthUser, id: string, dto: MajBulletinDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const b = await tx.bulletinPaie.findFirst({
        where: { id, employe: { etablissementId: user.etablissementId } },
        include: { employe: true },
      });
      if (!b) throw new NotFoundException('Bulletin introuvable');
      if (b.statut !== 'brouillon') {
        throw new BadRequestException('Seul un brouillon est modifiable');
      }
      const params = await tx.parametrePaie.findUnique({ where: { tenantId: user.tenantId } });
      const taux = params ?? {
        cotisationSalarialeBp: 0, impotBp: 0, heuresSupBp: 5000, minutesMensuelles: 12480,
      };
      const calc = calculerBulletin(
        b.employe.salaireBaseCentimes ?? 0n,
        taux,
        {
          primesCentimes: dto.primesCentimes ?? Number(b.primesCentimes),
          retenuesCentimes: dto.retenuesCentimes ?? Number(b.retenuesCentimes),
          heuresSupMinutes: dto.heuresSupMinutes ?? b.heuresSupMinutes,
        },
      );
      const updated = await tx.bulletinPaie.update({
        where: { id },
        data: calc,
      });
      await this.audit(tx, user, 'paie.bulletin.maj', id, dto.motif, {
        net: b.netCentimes.toString(),
      }, { net: updated.netCentimes.toString() });
      return updated;
    });
  }

  // ---------- Workflow 2 niveaux ----------

  /** Niveau 1 : brouillon → valide (paie.preparer). */
  async valider(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const b = await tx.bulletinPaie.findFirst({
        where: { id, employe: { etablissementId: user.etablissementId } },
      });
      if (!b) throw new NotFoundException('Bulletin introuvable');
      if (b.statut !== 'brouillon') {
        throw new BadRequestException(`Transition impossible depuis ${b.statut}`);
      }
      const updated = await tx.bulletinPaie.update({
        where: { id },
        data: { statut: 'valide', validatedBy: user.userId },
      });
      await this.audit(tx, user, 'paie.bulletin.valider', id, undefined);
      return updated;
    });
  }

  /** Niveau 2 : valide → approuve (paie.approuver) — JAMAIS le même utilisateur. */
  async approuver(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const b = await tx.bulletinPaie.findFirst({
        where: { id, employe: { etablissementId: user.etablissementId } },
      });
      if (!b) throw new NotFoundException('Bulletin introuvable');
      if (b.statut !== 'valide') {
        throw new BadRequestException(`Transition impossible depuis ${b.statut}`);
      }
      if (!b.validatedBy) {
        throw new BadRequestException('Bulletin sans validateur niveau 1');
      }
      if (b.validatedBy === user.userId) {
        throw new ForbiddenException(
          'La validation à deux niveaux exige deux utilisateurs distincts',
        );
      }
      const updated = await tx.bulletinPaie.update({
        where: { id },
        data: { statut: 'approuve', approvedBy: user.userId },
      });
      await this.audit(tx, user, 'paie.bulletin.approuver', id, undefined, {
        valide_par: b.validatedBy,
      }, { approuve_par: user.userId });
      this.logger.log('paie.bulletin.approuve', 'paie.bulletins', {
        tenant_id: user.tenantId, bulletin_id: id,
      });
      return updated;
    });
  }

  /** Annulation — brouillon ou valide, motif obligatoire. */
  async annuler(user: AuthUser, id: string, motif: string) {
    if (!motif || motif.length < 3) {
      throw new BadRequestException('Motif obligatoire (min 3 caractères)');
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const b = await tx.bulletinPaie.findFirst({
        where: { id, employe: { etablissementId: user.etablissementId } },
      });
      if (!b) throw new NotFoundException('Bulletin introuvable');
      if (!['brouillon', 'valide'].includes(b.statut)) {
        throw new BadRequestException(`Impossible d'annuler un bulletin ${b.statut}`);
      }
      const updated = await tx.bulletinPaie.update({
        where: { id },
        data: { statut: 'annule' },
      });
      await this.audit(tx, user, 'paie.bulletin.annuler', id, motif, {
        statut: b.statut,
      }, { statut: 'annule' });
      return updated;
    });
  }

  // ---------- Paiement ----------

  /** Planifie le paiement d'un bulletin approuvé → paiement_salaire 'planifie'. */
  async payer(user: AuthUser, id: string, dto: PayerBulletinDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const b = await tx.bulletinPaie.findFirst({
        where: { id, employe: { etablissementId: user.etablissementId } },
        include: { employe: true },
      });
      if (!b) throw new NotFoundException('Bulletin introuvable');
      if (b.statut !== 'approuve') {
        throw new BadRequestException('Seul un bulletin approuvé peut être payé');
      }
      const existant = await tx.paiementSalaire.findFirst({
        where: { bulletinId: id, statut: { notIn: ['echoue', 'a_rejouer'] } },
      });
      if (existant) {
        throw new BadRequestException('Un paiement est déjà planifié/en cours pour ce bulletin');
      }
      const coord = dto.coordonneePaiement ?? b.employe.coordonneePaiement;
      if (!coord) {
        throw new BadRequestException('Aucune coordonnée de paiement (employé ou requête)');
      }
      const paiement = await tx.paiementSalaire.create({
        data: {
          tenantId: user.tenantId,
          bulletinId: id,
          montantCentimes: b.netCentimes,
          statut: 'planifie',
        },
      });
      await this.audit(tx, user, 'paie.paiement.planifier', paiement.id, undefined, undefined, {
        bulletin_id: id,
        montant: b.netCentimes.toString(),
        // La coordonnée n'est JAMAIS auditée ni loguée (PII financière).
      });
      return { paiement, coordonneePaiement: coord };
    });
  }

  /** Confirmation manuelle du versement (MVP — provider payout = TODO). */
  async confirmerPaiement(user: AuthUser, paiementId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const p = await tx.paiementSalaire.findFirst({
        where: { id: paiementId, bulletin: { employe: { etablissementId: user.etablissementId } } },
        include: { bulletin: true },
      });
      if (!p) throw new NotFoundException('Paiement introuvable');
      if (p.statut !== 'planifie' && p.statut !== 'en_cours') {
        throw new BadRequestException(`Transition impossible depuis ${p.statut}`);
      }
      const now = new Date();
      const [maj, bulletin] = await Promise.all([
        tx.paiementSalaire.update({
          where: { id: p.id },
          data: { statut: 'reussi', paidAt: now },
        }),
        tx.bulletinPaie.update({ where: { id: p.bulletinId }, data: { statut: 'paye' } }),
      ]);
      await this.audit(tx, user, 'paie.paiement.confirmer', p.id, undefined,
        { statut: p.statut }, { statut: 'reussi' });
      return { paiement: maj, bulletin };
    });
  }

  /** Marque un paiement en échec → rejouable individuellement. */
  async echouerPaiement(user: AuthUser, paiementId: string, motif: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const p = await tx.paiementSalaire.findFirst({
        where: { id: paiementId, bulletin: { employe: { etablissementId: user.etablissementId } } },
      });
      if (!p) throw new NotFoundException('Paiement introuvable');
      if (!['planifie', 'en_cours'].includes(p.statut)) {
        throw new BadRequestException(`Transition impossible depuis ${p.statut}`);
      }
      const maj = await tx.paiementSalaire.update({
        where: { id: p.id },
        data: { statut: 'a_rejouer' },
      });
      await this.audit(tx, user, 'paie.paiement.echouer', p.id, motif,
        { statut: p.statut }, { statut: 'a_rejouer' });
      return maj;
    });
  }

  async listerPaiements(user: AuthUser, query: ListerPaiementsQuery) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.paiementSalaire.findMany({
        where: {
          tenantId: user.tenantId,
          ...(query.statut ? { statut: query.statut as never } : {}),
          bulletin: { employe: { etablissementId: user.etablissementId } },
        },
        include: {
          bulletin: {
            select: {
              id: true, periodeAnnee: true, periodeMois: true, netCentimes: true,
              employe: { select: { id: true, nom: true, prenom: true } },
            },
          },
        },
        orderBy: { id: 'desc' },
        take: 200,
      }),
    );
  }
}
