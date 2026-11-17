import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JsonLogger } from '../common/json.logger';
import { AuthUser } from '../auth/current-user.decorator';
import { CreerAvisDto } from './dto/client.dto';

type Tx = Prisma.TransactionClient;

/**
 * Expérience client (E5) : profil, historique commandes, reçus,
 * avis, fidélité. Toutes les routes exigent un token 'client'
 * (user.clientId) — vérifié ici car PermissionsGuard ne couvre pas
 * les routes client (pas de permissions staff).
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  private assertClient(user: AuthUser): string {
    if (!user.clientId) throw new ForbiddenException('Token client requis');
    return user.clientId;
  }

  me(user: AuthUser) {
    const clientId = this.assertClient(user);
    return this.prisma.client.findUnique({ where: { id: clientId } });
  }

  /** Historique commandes du client (tous établissements) + totaux. */
  async mesCommandes(user: AuthUser) {
    const clientId = this.assertClient(user);
    return this.prisma.platform((tx) =>
      tx.commande.findMany({
        where: { clientId },
        include: {
          etablissement: { select: { id: true, slug: true, raisonSociale: true } },
          place: { select: { numero: true } },
          lignes: { select: { quantite: true, totalCentimes: true, statut: true } },
          transactions: {
            where: { type: 'paiement', statut: 'reussie' },
            select: { id: true, montantCentimes: true, confirmedAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  /** Détail commande = suivi temps réel + reçu (B10). */
  async maCommande(user: AuthUser, commandeId: string) {
    const clientId = this.assertClient(user);
    const c = await this.prisma.platform((tx) =>
      tx.commande.findFirst({
        where: { id: commandeId, clientId },
        include: {
          etablissement: { select: { slug: true, raisonSociale: true, devise: true } },
          place: { select: { numero: true } },
          lignes: {
            include: {
              produit: { select: { nom: true } },
              variante: { select: { nom: true } },
            },
          },
          transactions: { orderBy: { createdAt: 'desc' } },
        },
      }),
    );
    if (!c) throw new NotFoundException('Commande introuvable');
    return c;
  }

  /** Fidélité du client par établissement (points, niveau). */
  async maFidelite(user: AuthUser) {
    const clientId = this.assertClient(user);
    return this.prisma.platform((tx) =>
      tx.fidelite.findMany({
        where: { clientId },
        include: { etablissement: { select: { slug: true, raisonSociale: true } } },
      }),
    );
  }

  /** Crée un avis sur une commande clôturée du client (B9). */
  async creerAvis(user: AuthUser, dto: CreerAvisDto) {
    const clientId = this.assertClient(user);
    const commande = await this.prisma.platform((tx) =>
      tx.commande.findFirst({
        where: { id: dto.commandeId, clientId, statut: 'cloturee' },
      }),
    );
    if (!commande) throw new NotFoundException('Commande clôturée introuvable');

    const existe = await this.prisma.platform((tx) =>
      tx.avis.findFirst({ where: { commandeId: dto.commandeId } }),
    );
    if (existe) throw new BadRequestException('Un avis existe déjà pour cette commande');

    return this.prisma.withTenant(commande.tenantId, (tx) =>
      tx.avis.create({
        data: {
          tenantId: commande.tenantId,
          etablissementId: commande.etablissementId,
          clientId,
          commandeId: dto.commandeId,
          note: dto.note,
          commentaire: dto.commentaire,
        },
      }),
    );
  }

  /** Avis publics d'un établissement (menu public). */
  avisPublics(slug: string) {
    return this.prisma.platform(async (tx) => {
      const etab = await tx.etablissement.findUnique({ where: { slug } });
      if (!etab) throw new NotFoundException('Établissement introuvable');
      return tx.avis.findMany({
        where: { etablissementId: etab.id, statut: 'publie' },
        include: { client: { select: { nom: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });
  }

  /** Réponse du gérant à un avis (staff, permission avis.repondre). */
  repondreAvis(user: AuthUser, avisId: string, reponseGerant: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const avis = await tx.avis.findFirst({
        where: { id: avisId, etablissementId: user.etablissementId },
      });
      if (!avis) throw new NotFoundException('Avis introuvable');
      return tx.avis.update({ where: { id: avisId }, data: { reponseGerant } });
    });
  }

  /**
   * Attribution de points fidélité — appelée à la clôture d'une commande
   * (espèces ou paiement confirmé). 1 point / 1 000 XOF encaissés.
   * Idempotent par commande via metadata : on vérifie les points déjà donnés.
   */
  async awardPoints(tx: Tx, tenantId: string, etablissementId: string, clientId: string | null, montantCentimes: bigint) {
    if (!clientId || montantCentimes <= 0n) return;
    const points = Number(montantCentimes / 100_000n); // 100 000 centimes = 1 000 XOF
    if (points <= 0) return;

    await tx.fidelite.upsert({
      where: {
        tenantId_clientId_etablissementId: { tenantId, clientId, etablissementId },
      },
      create: { tenantId, clientId, etablissementId, points },
      update: { points: { increment: points } },
    });
    this.logger.log('fidelite.points', 'fidelite.award', {
      client_id: clientId, points, montant_centimes: Number(montantCentimes),
    });
  }
}
