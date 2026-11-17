import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JsonLogger } from '../common/json.logger';

export interface Periode {
  debut: Date;
  fin: Date;
}

function parsePeriode(debut?: string, fin?: string): Periode {
  const f = fin ? new Date(fin) : new Date();
  const d = debut ? new Date(debut) : new Date(f.getTime() - 30 * 86400_000);
  if (isNaN(d.getTime()) || isNaN(f.getTime()) || f < d) {
    throw new BadRequestException('Période invalide (debut/fin ISO requises, fin ≥ debut)');
  }
  return { debut: d, fin: f };
}

@Injectable()
export class PilotageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  /** Dashboard gérant : CA, panier moyen, occupation, top produits, alertes. */
  async dashboard(user: AuthUser, debut?: string, fin?: string) {
    const periode = parsePeriode(debut, fin);
    const data = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const [txStats, commandes, places, topProduits, reservations, avisNonRepondus, retards] =
        await Promise.all([
          tx.transaction.groupBy({
            by: ['statut'],
            where: {
              tenantId: user.tenantId,
              etablissementId: user.etablissementId,
              createdAt: { gte: periode.debut, lte: periode.fin },
            },
            _sum: { montantCentimes: true, netEtablissementCentimes: true },
            _count: true,
          }),
          tx.commande.groupBy({
            by: ['statut'],
            where: {
              tenantId: user.tenantId,
              etablissementId: user.etablissementId,
              createdAt: { gte: periode.debut, lte: periode.fin },
            },
            _sum: { totalCentimes: true },
            _count: true,
          }),
          tx.place.groupBy({
            by: ['statut'],
            where: { etablissementId: user.etablissementId },
            _count: true,
          }),
          tx.ligneCommande.groupBy({
            by: ['produitId'],
            where: {
              tenantId: user.tenantId,
              commande: {
                etablissementId: user.etablissementId,
                createdAt: { gte: periode.debut, lte: periode.fin },
                statut: { not: 'annulee' },
              },
            },
            _sum: { quantite: true, totalCentimes: true },
            orderBy: { _sum: { quantite: 'desc' } },
            take: 10,
          }),
          tx.reservation.groupBy({
            by: ['statut'],
            where: {
              tenantId: user.tenantId,
              etablissementId: user.etablissementId,
              creneauDebut: { gte: periode.debut, lte: periode.fin },
            },
            _count: true,
          }),
          tx.avis.count({
            where: {
              tenantId: user.tenantId,
              etablissementId: user.etablissementId,
              reponseGerant: null,
            },
          }),
          tx.pointage.count({
            where: {
              tenantId: user.tenantId,
              statut: 'retard',
              heureArrivee: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) },
            },
          }),
        ]);

      const produits = topProduits.length
        ? await tx.produit.findMany({
            where: { id: { in: topProduits.map((p) => p.produitId) } },
            select: { id: true, nom: true },
          })
        : [];
      const nomParId = new Map(produits.map((p) => [p.id, p.nom]));

      const reussies = txStats.find((t) => t.statut === 'reussie');
      const caBrut = reussies?._sum.montantCentimes ?? 0n;
      const caNet = reussies?._sum.netEtablissementCentimes ?? 0n;
      const nbTransactions = reussies?._count ?? 0;
      const totalPlaces = places.reduce((a, p) => a + p._count, 0);
      const occupees = places
        .filter((p) => ['occupee', 'addition', 'reservee'].includes(p.statut))
        .reduce((a, p) => a + p._count, 0);
      const cloturees = commandes.find((c) => c.statut === 'cloturee');
      const panierMoyen = cloturees && cloturees._count > 0
        ? (cloturees._sum.totalCentimes ?? 0n) / BigInt(cloturees._count)
        : 0n;

      return {
        periode: { debut: periode.debut, fin: periode.fin },
        ca: {
          brut_centimes: caBrut.toString(),
          net_etablissement_centimes: caNet.toString(),
          transactions_reussies: nbTransactions,
        },
        commandes: {
          panier_moyen_centimes: panierMoyen.toString(),
          par_statut: Object.fromEntries(
            commandes.map((c) => [c.statut, { count: c._count, total: (c._sum.totalCentimes ?? 0n).toString() }]),
          ),
        },
        occupation: {
          places_total: totalPlaces,
          places_occupees: occupees,
          taux: totalPlaces > 0 ? occupees / totalPlaces : 0,
        },
        top_produits: topProduits.map((l) => ({
          produit_id: l.produitId,
          nom: nomParId.get(l.produitId) ?? '?',
          quantite: Number(l._sum.quantite ?? 0),
          montant_centimes: (l._sum.totalCentimes ?? 0n).toString(),
        })),
        reservations: Object.fromEntries(reservations.map((r) => [r.statut, r._count])),
        alertes: {
          avis_non_repondus: avisNonRepondus,
          retards_aujourdhui: retards,
        },
      };
    });
    this.logger.log('pilotage.dashboard', 'pilotage', { tenant_id: user.tenantId });
    return data;
  }

  // ---------- Exports ----------

  private toCsv(headers: string[], rows: (string | number | bigint | null | undefined)[][]): string {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  }

  /** Export commandes CSV/JSON — permission rapport.exporter. */
  async exportCommandes(user: AuthUser, debut: string, fin: string, format: string) {
    const periode = parsePeriode(debut, fin);
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.commande.findMany({
        where: {
          tenantId: user.tenantId,
          etablissementId: user.etablissementId,
          createdAt: { gte: periode.debut, lte: periode.fin },
        },
        select: {
          id: true, createdAt: true, type: true, statut: true,
          totalCentimes: true, clientId: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 50_000,
      }),
    );
    this.logger.log('pilotage.export.commandes', 'pilotage.export', {
      tenant_id: user.tenantId, lignes: rows.length,
    });
    if (format === 'csv') {
      return this.toCsv(
        ['id', 'date', 'type', 'statut', 'total_centimes', 'client_id'],
        rows.map((r) => [r.id, r.createdAt.toISOString(), r.type, r.statut, r.totalCentimes, r.clientId]),
      );
    }
    return rows;
  }

  /** Export transactions CSV/JSON. */
  async exportTransactions(user: AuthUser, debut: string, fin: string, format: string) {
    const periode = parsePeriode(debut, fin);
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.transaction.findMany({
        where: {
          tenantId: user.tenantId,
          etablissementId: user.etablissementId,
          createdAt: { gte: periode.debut, lte: periode.fin },
        },
        select: {
          id: true, createdAt: true, confirmedAt: true, fournisseur: true,
          type: true, statut: true, montantCentimes: true,
          commissionPlateformeCentimes: true, netEtablissementCentimes: true,
          referenceExterne: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 50_000,
      }),
    );
    this.logger.log('pilotage.export.transactions', 'pilotage.export', {
      tenant_id: user.tenantId, lignes: rows.length,
    });
    if (format === 'csv') {
      return this.toCsv(
        ['id', 'date', 'confirmee_le', 'fournisseur', 'type', 'statut',
          'montant_centimes', 'commission_centimes', 'net_centimes', 'reference'],
        rows.map((r) => [
          r.id, r.createdAt.toISOString(), r.confirmedAt?.toISOString() ?? '',
          r.fournisseur, r.type, r.statut, r.montantCentimes,
          r.commissionPlateformeCentimes, r.netEtablissementCentimes, r.referenceExterne,
        ]),
      );
    }
    return rows;
  }
}
