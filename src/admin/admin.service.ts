import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JsonLogger } from '../common/json.logger';
import {
  ListerEtablissementsQuery, ListerTransactionsAdminQuery, MajAbonnementDto,
} from './dto/admin.dto';

const STATUTS_CIBLES: Record<string, string> = {
  valider: 'actif',
  rejeter: 'rejete',
  suspendre: 'suspendu',
  reactiver: 'actif',
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  /** Audit platform-level : rattaché au tenant CIBLE, auteur = super-admin. */
  private async auditPlateforme(
    tx: Prisma.TransactionClient,
    admin: AuthUser,
    tenantCible: string,
    action: string,
    entiteId: string,
    motif: string,
    apres?: Record<string, unknown>,
    entiteType = 'etablissement',
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: tenantCible,
        // L'admin plateforme n'est pas un Utilisateur du tenant cible → id null,
        // auteur tracé dans `apres`.
        utilisateurId: null,
        action,
        entiteType,
        entiteId,
        motif,
        apres: { admin_user_id: admin.userId, ...apres } as never,
      },
    });
  }

  // ---------- Établissements (file KYC) ----------

  async listerEtablissements(query: ListerEtablissementsQuery) {
    return this.prisma.platform((tx) =>
      tx.etablissement.findMany({
        where: {
          ...(query.statut ? { statut: query.statut as never } : {}),
          ...(query.recherche
            ? {
                OR: [
                  { raisonSociale: { contains: query.recherche, mode: 'insensitive' } },
                  { slug: { contains: query.recherche, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: {
          id: true, tenantId: true, raisonSociale: true, slug: true, statut: true,
          rccm: true, nif: true, createdAt: true,
          abonnements: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { plan: true, statut: true, debut: true, fin: true },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
    );
  }

  async transitionStatut(etablissementId: string, action: string, motif: string, admin: AuthUser) {
    const cible = STATUTS_CIBLES[action];
    if (!cible) throw new BadRequestException(`Action inconnue: ${action}`);
    return this.prisma.platform(async (tx) => {
      const etab = await tx.etablissement.findUnique({ where: { id: etablissementId } });
      if (!etab) throw new NotFoundException('Établissement introuvable');
      if (etab.statut === cible) {
        throw new BadRequestException(`Déjà ${cible}`);
      }
      // Suspension/réactivation : motif obligatoire ; validation : motif optionnel tracé.
      const updated = await tx.etablissement.update({
        where: { id: etablissementId },
        data: { statut: cible as never },
      });
      // Suspendre l'abonnement actif si suspension d'établissement.
      if (action === 'suspendre') {
        await tx.abonnement.updateMany({
          where: { etablissementId, statut: { in: ['essai', 'actif', 'impaye'] } },
          data: { statut: 'suspendu' },
        });
      }
      await this.auditPlateforme(tx, admin, etab.tenantId, `admin.etablissement.${action}`, etab.id, motif, {
        avant: etab.statut,
        apres: cible,
      });
      this.logger.log(`admin.etablissement.${action}`, 'admin.etablissement', {
        tenant_id: etab.tenantId, etablissement_id: etab.id,
      });
      return updated;
    });
  }

  // ---------- Supervision transactions (litiges) ----------

  async listerTransactions(query: ListerTransactionsAdminQuery) {
    return this.prisma.platform((tx) =>
      tx.transaction.findMany({
        where: {
          ...(query.statut ? { statut: query.statut as never } : {}),
          ...(query.fournisseur ? { fournisseur: query.fournisseur as never } : {}),
        },
        select: {
          id: true, tenantId: true, etablissementId: true, fournisseur: true,
          type: true, statut: true, montantCentimes: true, devise: true,
          referenceExterne: true, createdAt: true, confirmedAt: true,
          etablissement: { select: { raisonSociale: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  // ---------- Abonnements SaaS ----------

  async listerAbonnements() {
    return this.prisma.platform((tx) =>
      tx.abonnement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: {
          etablissement: { select: { id: true, raisonSociale: true, slug: true, statut: true } },
        },
      }),
    );
  }

  async majAbonnement(abonnementId: string, dto: MajAbonnementDto, admin: AuthUser) {
    if (!dto.plan && !dto.statut && dto.montantCentimes === undefined) {
      throw new BadRequestException('Aucun champ à modifier');
    }
    return this.prisma.platform(async (tx) => {
      const abo = await tx.abonnement.findUnique({
        where: { id: abonnementId },
        include: { etablissement: { select: { tenantId: true } } },
      });
      if (!abo) throw new NotFoundException('Abonnement introuvable');
      const updated = await tx.abonnement.update({
        where: { id: abonnementId },
        data: {
          ...(dto.plan ? { plan: dto.plan as never } : {}),
          ...(dto.statut ? { statut: dto.statut as never } : {}),
          ...(dto.montantCentimes !== undefined
            ? { montantCentimes: BigInt(dto.montantCentimes) } : {}),
        },
      });
      await this.auditPlateforme(
        tx, admin, abo.etablissement.tenantId,
        'admin.abonnement.modifier', abonnementId, dto.motif ?? 'Modification abonnement',
        {
          avant: { plan: abo.plan, statut: abo.statut, montant: abo.montantCentimes.toString() },
          apres: {
            plan: updated.plan, statut: updated.statut,
            montant: updated.montantCentimes.toString(),
          },
        },
        'abonnement',
      );
      return updated;
    });
  }
}
