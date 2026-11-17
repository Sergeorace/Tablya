import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { PlaceStatut, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlaceDto, CreateZoneDto, UpdatePlaceDto, UpdateZoneDto } from './dto/salle.dto';
import { JsonLogger } from '../common/json.logger';
import { AuthUser } from '../auth/current-user.decorator';

type Tx = Prisma.TransactionClient;

@Injectable()
export class SalleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  // ---------------- Zones ----------------

  listZones(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.zone.findMany({
        where: { etablissementId: user.etablissementId },
        include: { _count: { select: { places: true } } },
        orderBy: { nom: 'asc' },
      }),
    );
  }

  createZone(user: AuthUser, dto: CreateZoneDto) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.zone.create({
        data: {
          tenantId: user.tenantId,
          etablissementId: user.etablissementId,
          nom: dto.nom,
          capaciteDefaut: dto.capaciteDefaut,
        },
      }),
    );
  }

  updateZone(user: AuthUser, zoneId: string, dto: UpdateZoneDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const zone = await tx.zone.findFirst({
        where: { id: zoneId, etablissementId: user.etablissementId },
      });
      if (!zone) throw new NotFoundException('Zone introuvable');
      return tx.zone.update({ where: { id: zoneId }, data: dto });
    });
  }

  deleteZone(user: AuthUser, zoneId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const count = await tx.place.count({ where: { zoneId } });
      if (count > 0) throw new BadRequestException('Zone non vide : déplacez ou supprimez ses places d\'abord');
      await tx.zone.delete({ where: { id: zoneId } });
      return { ok: true };
    });
  }

  // ---------------- Places ----------------

  /**
   * Numérotation unique ETAB-ZONE-NNN (CDC C2) :
   * ETAB = préfixe dérivé du slug établissement (8 car. max, alphanum.
   * majuscules), ZONE = 3 premières lettres du nom de zone en majuscules,
   * NNN = compteur par zone (3 chiffres, extensible). Unicité garantie
   * par @@unique([tenantId, numero]) — les collisions sont retentées.
   */
  private async generateNumero(tx: Tx, etablissementId: string, zoneId: string): Promise<string> {
    const [etab, zone] = await Promise.all([
      tx.etablissement.findUniqueOrThrow({ where: { id: etablissementId } }),
      tx.zone.findUniqueOrThrow({ where: { id: zoneId } }),
    ]);
    const etabPrefix = etab.slug.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase();
    const zonePrefix = zone.nom.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || 'ZON';
    const count = await tx.place.count({ where: { zoneId } });
    const seq = String(count + 1).padStart(3, '0');
    return `${etabPrefix}-${zonePrefix}-${seq}`;
  }

  listPlaces(user: AuthUser, zoneId?: string) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.place.findMany({
        where: { etablissementId: user.etablissementId, ...(zoneId ? { zoneId } : {}) },
        include: { zone: { select: { id: true, nom: true } } },
        orderBy: [{ zoneId: 'asc' }, { numero: 'asc' }],
      }),
    );
  }

  /** Plan de salle complet : zones + places groupées (C1/C8). */
  planSalle(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const zones = await tx.zone.findMany({
        where: { etablissementId: user.etablissementId, active: true },
        include: {
          places: {
            orderBy: { numero: 'asc' },
            include: {
              commandes: {
                where: { statut: { in: ['recue', 'en_preparation', 'prete', 'servie'] } },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { id: true, statut: true, totalCentimes: true },
              },
            },
          },
        },
        orderBy: { nom: 'asc' },
      });
      return { zones };
    });
  }

  async createPlace(user: AuthUser, dto: CreatePlaceDto) {
    const place = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const zone = await tx.zone.findFirst({
        where: { id: dto.zoneId, etablissementId: user.etablissementId },
      });
      if (!zone) throw new NotFoundException('Zone introuvable');

      // Numéro : fourni ou généré ; retry sur collision d'unicité
      let numero = dto.numero;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = numero ?? (await this.generateNumero(tx, user.etablissementId, dto.zoneId));
        try {
          return await tx.place.create({
            data: {
              tenantId: user.tenantId,
              etablissementId: user.etablissementId,
              zoneId: dto.zoneId,
              numero: candidate,
              capacite: dto.capacite ?? zone.capaciteDefaut ?? 4,
              type: dto.type ?? 'table',
              qrToken: randomBytes(24).toString('base64url'), // 192 bits, opaque
            },
            include: { zone: { select: { id: true, nom: true } } },
          });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            if (dto.numero) throw new BadRequestException(`Le numéro ${dto.numero} existe déjà`);
            numero = undefined; // régénère
            continue;
          }
          throw e;
        }
      }
      throw new BadRequestException('Impossible de générer un numéro unique');
    });

    this.logger.log('place.creee', 'salle.place', {
      place_id: place.id,
      numero: place.numero,
      zone: place.zone.nom,
    });
    return place;
  }

  updatePlace(user: AuthUser, placeId: string, dto: UpdatePlaceDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const place = await tx.place.findFirst({
        where: { id: placeId, etablissementId: user.etablissementId },
      });
      if (!place) throw new NotFoundException('Place introuvable');
      if (dto.zoneId) {
        const zone = await tx.zone.findFirst({
          where: { id: dto.zoneId, etablissementId: user.etablissementId },
        });
        if (!zone) throw new NotFoundException('Zone introuvable');
      }
      const { statut, ...rest } = dto;
      const data: Prisma.PlaceUncheckedUpdateInput = {
        ...rest,
        ...(statut !== undefined ? { statut: statut as PlaceStatut } : {}),
      };
      return tx.place.update({ where: { id: placeId }, data });
    });
  }

  deletePlace(user: AuthUser, placeId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const place = await tx.place.findFirst({
        where: { id: placeId, etablissementId: user.etablissementId },
        include: { _count: { select: { commandes: true, reservations: true } } },
      });
      if (!place) throw new NotFoundException('Place introuvable');
      if (place.statut === 'occupee' || place._count.commandes > 0 || place._count.reservations > 0) {
        throw new BadRequestException('Place liée à des commandes/réservations : passez-la hors service');
      }
      await tx.place.delete({ where: { id: placeId } });
      return { ok: true };
    });
  }

  /** Régénère le qr_token (rotation, QR perdu). */
  rotateQrToken(user: AuthUser, placeId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const place = await tx.place.findFirst({
        where: { id: placeId, etablissementId: user.etablissementId },
      });
      if (!place) throw new NotFoundException('Place introuvable');
      return tx.place.update({
        where: { id: placeId },
        data: { qrToken: randomBytes(24).toString('base64url') },
      });
    });
  }

  // ---------------- QR imprimable ----------------

  /** Payload encodé dans le QR : tablya://{slug}/place/{qrToken} (opaque, réversible). */
  private qrPayload(slug: string, qrToken: string): string {
    return `tablya://${slug}/place/${qrToken}`;
  }

  /** SVG du QR d'une place — auth staff (salle.gerer). */
  async qrSvg(user: AuthUser, placeId: string) {
    const place = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.place.findFirst({
        where: { id: placeId, etablissementId: user.etablissementId },
        include: {
          etablissement: { select: { slug: true, raisonSociale: true } },
          zone: { select: { nom: true } },
        },
      }),
    );
    if (!place) throw new NotFoundException('Place introuvable');
    const payload = this.qrPayload(place.etablissement.slug, place.qrToken);
    const svg = await QRCode.toString(payload, {
      type: 'svg', margin: 2, width: 480, color: { dark: '#0f172a', light: '#ffffff' },
    });
    return {
      svg,
      payload,
      place: { id: place.id, numero: place.numero, zone: place.zone.nom },
      etablissement: place.etablissement.raisonSociale,
    };
  }

  /** Page HTML d'impression : toutes les places de l'établissement avec leur QR. */
  async qrPrintPage(user: AuthUser) {
    const places = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.place.findMany({
        where: { etablissementId: user.etablissementId },
        include: {
          etablissement: { select: { slug: true, raisonSociale: true } },
          zone: { select: { nom: true } },
        },
        orderBy: [{ zoneId: 'asc' }, { numero: 'asc' }],
      }),
    );
    const cards = await Promise.all(
      places.map(async (p) => {
        const payload = this.qrPayload(p.etablissement.slug, p.qrToken);
        const svg = await QRCode.toString(payload, { type: 'svg', margin: 1, width: 300 });
        return `
          <div class="card">
            <div class="zone">${p.zone.nom}</div>
            <div class="numero">${p.numero}</div>
            <div class="qr">${svg}</div>
            <div class="cap">${p.capacite} personnes</div>
          </div>`;
      }),
    );
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>QR tables — ${places[0]?.etablissement.raisonSociale ?? 'Tablya'}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:24px}
  h1{font-size:20px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}
  .card{border:1px solid #ccc;border-radius:12px;padding:12px;text-align:center;page-break-inside:avoid}
  .zone{font-size:11px;text-transform:uppercase;color:#666}
  .numero{font-size:22px;font-weight:700;font-family:monospace}
  .qr svg{width:100%;height:auto}
  .cap{font-size:11px;color:#666}
  @media print{button{display:none}}
</style></head><body>
<h1>${places[0]?.etablissement.raisonSociale ?? ''} — QR codes tables</h1>
<button onclick="window.print()">Imprimer</button>
<div class="grid">${cards.join('')}</div>
</body></html>`;
  }

  // ---------------- Public (scan QR client) ----------------

  /**
   * Résolution QR → place + établissement (endpoint public, B6).
   * Le tenant est résolu via le slug ; la place via qr_token.
   */
  async resolveQrToken(slug: string, qrToken: string) {
    const etablissement = await this.prisma.etablissement.findUnique({
      where: { slug },
      select: { id: true, tenantId: true, slug: true, raisonSociale: true, statut: true },
    });
    if (!etablissement || etablissement.statut !== 'actif') {
      throw new NotFoundException('Établissement introuvable');
    }
    return this.prisma.withTenant(etablissement.tenantId, async (tx) => {
      const place = await tx.place.findFirst({
        where: { qrToken, etablissementId: etablissement.id },
        include: { zone: { select: { id: true, nom: true } } },
      });
      if (!place) throw new NotFoundException('QR code invalide');
      return {
        etablissement: {
          slug: etablissement.slug,
          nom: etablissement.raisonSociale,
        },
        place: {
          id: place.id,
          numero: place.numero,
          capacite: place.capacite,
          type: place.type,
          statut: place.statut,
          zone: place.zone.nom,
        },
      };
    });
  }
}
