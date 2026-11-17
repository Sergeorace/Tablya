import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategorieDto, CreateProduitDto, UpdateCategorieDto, UpdateProduitDto,
} from './dto/catalogue.dto';
import { JsonLogger } from '../common/json.logger';
import { AuthUser } from '../auth/current-user.decorator';

@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  // ---------------- Catégories ----------------

  listCategories(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.categorie.findMany({
        where: { etablissementId: user.etablissementId },
        include: { _count: { select: { produits: true } } },
        orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
      }),
    );
  }

  createCategorie(user: AuthUser, dto: CreateCategorieDto) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.categorie.create({
        data: {
          tenantId: user.tenantId,
          etablissementId: user.etablissementId,
          nom: dto.nom,
          ordre: dto.ordre ?? 0,
        },
      }),
    );
  }

  updateCategorie(user: AuthUser, id: string, dto: UpdateCategorieDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.assertCategorie(tx, user.etablissementId, id);
      return tx.categorie.update({ where: { id }, data: dto });
    });
  }

  deleteCategorie(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.assertCategorie(tx, user.etablissementId, id);
      const count = await tx.produit.count({ where: { categorieId: id } });
      if (count > 0) throw new BadRequestException('Catégorie non vide : réaffectez ses produits d\'abord');
      await tx.categorie.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ---------------- Produits ----------------

  listProduits(user: AuthUser, categorieId?: string, inclureInactifs = false) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.produit.findMany({
        where: {
          etablissementId: user.etablissementId,
          ...(categorieId ? { categorieId } : {}),
          ...(inclureInactifs ? {} : { actif: true }),
        },
        include: {
          categorie: { select: { id: true, nom: true } },
          variantes: { where: { actif: true }, orderBy: { prixCentimes: 'asc' } },
          stocks: { select: { quantite: true, seuilAlerte: true, unite: true } },
        },
        orderBy: [{ nom: 'asc' }],
      }),
    );
  }

  async createProduit(user: AuthUser, dto: CreateProduitDto) {
    const produit = await this.prisma.withTenant(user.tenantId, async (tx) => {
      if (dto.categorieId) {
        await this.assertCategorie(tx, user.etablissementId, dto.categorieId);
      }
      // Produit avec variantes : le prix vit sur les variantes ;
      // sans variantes, on crée une variante "Standard" porteuse du prix.
      const hasVariants = (dto.variantes?.length ?? 0) > 0;
      const data: Prisma.ProduitUncheckedCreateInput = {
        tenantId: user.tenantId,
        etablissementId: user.etablissementId,
        categorieId: dto.categorieId,
        nom: dto.nom,
        description: dto.description,
        photoUrl: dto.photoUrl,
        allergenes: (dto.allergenes ?? undefined) as never,
        disponible: dto.disponible ?? true,
        menuCompose: dto.menuCompose ?? false,
        prixParPlage: (dto.prixParPlage ?? undefined) as never,
        variantes: {
          create: hasVariants
            ? dto.variantes!.map((v) => ({ tenantId: user.tenantId, nom: v.nom, prixCentimes: BigInt(v.prixCentimes), actif: v.actif ?? true }))
            : [{ tenantId: user.tenantId, nom: 'Standard', prixCentimes: BigInt(dto.prixCentimes ?? 0), actif: true }],
        },
      };
      return tx.produit.create({
        data,
        include: { variantes: true, categorie: { select: { id: true, nom: true } } },
      });
    });

    this.logger.log('produit.cree', 'catalogue.produit', {
      produit_id: produit.id,
      nom: produit.nom,
    });
    return produit;
  }

  async updateProduit(user: AuthUser, id: string, dto: UpdateProduitDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.assertProduit(tx, user.etablissementId, id);
      if (dto.categorieId) await this.assertCategorie(tx, user.etablissementId, dto.categorieId);
      const { prixParPlage, allergenes, variantes, prixCentimes, ...rest } = dto;
      const data: Prisma.ProduitUncheckedUpdateInput = {
        ...rest,
        ...(allergenes !== undefined ? { allergenes: allergenes as never } : {}),
        ...(prixParPlage !== undefined ? { prixParPlage: prixParPlage as never } : {}),
      };
      const produit = await tx.produit.update({
        where: { id },
        data,
        include: { variantes: { where: { actif: true } }, categorie: { select: { id: true, nom: true } } },
      });

      // Synchronisation des variantes si fournies : update par id,
      // create pour les nouvelles, désactivation logique des absentes
      // (jamais de delete — lignes de commande historiques).
      if (variantes !== undefined) {
        const keptIds = variantes.filter((v) => v.id).map((v) => v.id!);
        await tx.variante.updateMany({
          where: { produitId: id, actif: true, id: { notIn: keptIds } },
          data: { actif: false },
        });
        for (const v of variantes) {
          if (v.id) {
            await tx.variante.updateMany({
              where: { id: v.id, produitId: id },
              data: { nom: v.nom, prixCentimes: BigInt(v.prixCentimes), actif: v.actif ?? true },
            });
          } else {
            await tx.variante.create({
              data: {
                tenantId: user.tenantId,
                produitId: id,
                nom: v.nom,
                prixCentimes: BigInt(v.prixCentimes),
                actif: v.actif ?? true,
              },
            });
          }
        }
      } else if (prixCentimes !== undefined) {
        // Produit à prix simple : le prix vit sur la variante « Standard ».
        await tx.variante.updateMany({
          where: { produitId: id, nom: 'Standard' },
          data: { prixCentimes: BigInt(prixCentimes) },
        });
      }
      return produit;
    });
  }

  /** Toggle disponibilité temps réel (B3) — propagé via Socket.IO en E3. */
  setDisponible(user: AuthUser, id: string, disponible: boolean) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.assertProduit(tx, user.etablissementId, id);
      const produit = await tx.produit.update({ where: { id }, data: { disponible } });
      this.logger.log('produit.disponibilite', 'catalogue.produit', {
        produit_id: id, disponible,
      });
      return produit;
    });
  }

  deleteProduit(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.assertProduit(tx, user.etablissementId, id);
      const lignes = await tx.ligneCommande.count({ where: { produitId: id } });
      if (lignes > 0) {
        // Jamais de suppression physique : archivage logique
        await tx.produit.update({ where: { id }, data: { actif: false, disponible: false } });
        return { ok: true, archived: true };
      }
      await tx.produit.delete({ where: { id } });
      return { ok: true, archived: false };
    });
  }

  // ---------------- Public (menu client, B3) ----------------

  /** Menu public d'un établissement : catégories + produits + variantes + prix applicables. */
  async getMenuPublic(slug: string) {
    const etablissement = await this.prisma.etablissement.findUnique({
      where: { slug },
      select: { id: true, tenantId: true, statut: true, raisonSociale: true, horaires: true },
    });
    if (!etablissement || etablissement.statut !== 'actif') {
      throw new NotFoundException('Établissement introuvable');
    }
    return this.prisma.withTenant(etablissement.tenantId, async (tx) => {
      const categories = await tx.categorie.findMany({
        where: { etablissementId: etablissement.id, active: true },
        orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
        include: {
          produits: {
            where: { actif: true, disponible: true },
            orderBy: { nom: 'asc' },
            include: {
              variantes: { where: { actif: true }, orderBy: { prixCentimes: 'asc' } },
            },
          },
        },
      });
      return {
        etablissement: { nom: etablissement.raisonSociale, horaires: etablissement.horaires },
        categories,
      };
    });
  }

  // ---------------- Helpers ----------------

  private async assertCategorie(tx: Prisma.TransactionClient, etablissementId: string, id: string) {
    const c = await tx.categorie.findFirst({ where: { id, etablissementId } });
    if (!c) throw new NotFoundException('Catégorie introuvable');
  }

  private async assertProduit(tx: Prisma.TransactionClient, etablissementId: string, id: string) {
    const p = await tx.produit.findFirst({ where: { id, etablissementId } });
    if (!p) throw new NotFoundException('Produit introuvable');
  }
}
