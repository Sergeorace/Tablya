import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JsonLogger } from '../common/json.logger';
import { AuthUser } from '../auth/current-user.decorator';
import { CreerAvisDto, CreerCommandeClientDto } from './dto/client.dto';
import { RealtimeService } from '../realtime/realtime.service';

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
    private readonly realtime: RealtimeService,
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

  /** Liste staff des avis de l'établissement (modération/réponse gérant). */
  listerAvis(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.avis.findMany({
        where: { etablissementId: user.etablissementId },
        include: { client: { select: { nom: true, telephone: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
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

  // ---------- Commande client (scan QR → panier → commande) ----------

  /**
   * Création de commande par le client authentifié (JWT 'client').
   * Le tenant est résolu via le slug — jamais fourni par le client
   * (anti-IDOR : la place est vérifiée dans ce tenant).
   */
  async creerCommande(user: AuthUser, dto: CreerCommandeClientDto) {
    const clientId = this.assertClient(user);
    const etablissement = await this.prisma.etablissement.findUnique({
      where: { slug: dto.slug },
      select: { id: true, tenantId: true, statut: true, raisonSociale: true },
    });
    if (!etablissement || etablissement.statut !== 'actif') {
      throw new NotFoundException('Établissement introuvable');
    }
    const { tenantId, id: etablissementId } = etablissement;

    // Idempotence : même clé → même commande (retry réseau, double-tap).
    const existant = await this.prisma.withTenant(tenantId, (tx) =>
      tx.commande.findUnique({ where: { idempotencyKey: dto.idempotencyKey } }),
    );
    if (existant) return { ...existant, _deduplicated: true };

    const commande = await this.prisma.withTenant(tenantId, async (tx) => {
      // Verrouillage atomique de la place : libre|reservee → occupee.
      if (dto.placeId) {
        const res = await tx.place.updateMany({
          where: {
            id: dto.placeId,
            etablissementId,
            statut: { in: ['libre', 'reservee'] },
          },
          data: { statut: 'occupee' },
        });
        if (res.count === 0) {
          const place = await tx.place.findFirst({ where: { id: dto.placeId } });
          if (!place || place.etablissementId !== etablissementId) {
            throw new NotFoundException('Place introuvable');
          }
          throw new ConflictException(
            `La place ${place.numero} n'est pas disponible (${place.statut})`,
          );
        }
      }

      // Construction des lignes : prix serveur, jamais celui du client.
      const lignesData = [];
      for (const l of dto.lignes) {
        const produit = await tx.produit.findFirst({
          where: {
            id: l.produitId, etablissementId, actif: true, disponible: true,
          },
          include: { variantes: { where: { actif: true } } },
        });
        if (!produit) {
          throw new NotFoundException(`Produit ${l.produitId} indisponible`);
        }
        const variante = l.varianteId
          ? produit.variantes.find((v) => v.id === l.varianteId)
          : produit.variantes[0];
        if (!variante) {
          throw new BadRequestException('Variante introuvable pour ce produit');
        }
        lignesData.push({
          tenantId,
          produitId: produit.id,
          varianteId: variante.id,
          quantite: l.quantite,
          prixUnitaireCentimes: variante.prixCentimes,
          totalCentimes: variante.prixCentimes * BigInt(l.quantite),
          posteCible: 'cuisine' as const,
          statut: 'en_attente' as const,
        });
      }
      const total = lignesData.reduce((s, l) => s + l.totalCentimes, 0n);

      const created = await tx.commande.create({
        data: {
          tenantId,
          etablissementId,
          placeId: dto.placeId ?? null,
          clientId,
          serveurId: null,
          type: dto.placeId ? 'sur_place' : 'emporter',
          totalCentimes: total,
          idempotencyKey: dto.idempotencyKey,
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
      await tx.auditLog.create({
        data: {
          tenantId,
          action: 'commande.client_creee',
          entiteType: 'commande',
          entiteId: created.id,
          apres: {
            client_id: clientId,
            place_id: dto.placeId ?? null,
            total: total.toString(),
          } as never,
        },
      });
      return created;
    });

    this.realtime.commandeNouvelle(tenantId, {
      id: commande.id,
      placeId: commande.placeId,
      totalCentimes: Number(commande.totalCentimes),
      clientId,
    });
    this.logger.log('commande.client_creee', 'clients.commande', {
      commande_id: commande.id, client_id: clientId,
    });
    return commande;
  }
}
