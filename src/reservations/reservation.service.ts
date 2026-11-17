import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ReservationStatut } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { JsonLogger } from '../common/json.logger';
import { getRequestContext } from '../common/als';
import { AuthUser } from '../auth/current-user.decorator';
import {
  CreerReservationDto, ListeAttenteDto, UpdateReservationStatutDto,
} from './dto/reservation.dto';

/** Transitions staff autorisées (annulation/no-show/honorée). */
const TRANSITIONS: Record<ReservationStatut, ReservationStatut[]> = {
  en_attente: ['confirmee', 'annulee'],
  confirmee: ['annulee', 'no_show', 'honoree'],
  annulee: [],
  no_show: [],
  honoree: [],
};

const RESA_DURATION_MIN = 120; // durée standard d'un service — TODO: depuis horaires etablissement

@Injectable()
export class ReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly logger: JsonLogger,
  ) {}

  // ---------------- Public : création / consultation ----------------

  /** Crée une réservation (client sans compte obligatoire — B1). */
  async creer(dto: CreerReservationDto) {
    const etab = await this.prisma.etablissement.findUnique({
      where: { slug: dto.etablissementSlug },
      select: { id: true, tenantId: true, statut: true },
    });
    if (!etab || etab.statut !== 'actif') throw new NotFoundException('Établissement introuvable ou inactif');

    const debut = new Date(dto.creneauDebut);
    const fin = new Date(debut.getTime() + RESA_DURATION_MIN * 60_000);
    if (debut <= new Date()) throw new BadRequestException('Créneau dans le passé');

    // Anti-conflit : même place + chevauchement → refus (EXCLUDE en BDD = TODO migration)
    if (dto.placeId) {
      const conflit = await this.prisma.platform((tx) =>
        tx.reservation.count({
          where: {
            placeId: dto.placeId,
            statut: { in: ['confirmee', 'en_attente'] },
            creneauDebut: { lt: fin },
            creneauFin: { gt: debut },
          },
        }),
      );
      if (conflit > 0) throw new ConflictException('Ce créneau n\'est plus disponible pour cette place');
    }

    const telephone = dto.telephone.replace(/[^\d+]/g, '');
    const result = await this.prisma.withTenant(etab.tenantId, async (tx) => {
      const client = await tx.client.upsert({
        where: { telephone },
        create: { telephone, nom: dto.nom, email: dto.email },
        update: {},
      });
      return tx.reservation.create({
        data: {
          tenantId: etab.tenantId,
          etablissementId: etab.id,
          placeId: dto.placeId,
          clientId: client.id,
          creneauDebut: debut,
          creneauFin: fin,
          nbPersonnes: dto.nbPersonnes,
          statut: 'confirmee',
        },
      });
    });

    this.logger.log('reservation.creee', 'reservation.create', {
      reservation_id: result.id, etablissement_id: etab.id,
    });
    // TODO(E9): SMS/e-mail de confirmation + rappel J-2h
    return { reservation: result, message: 'Réservation confirmée' };
  }

  /** Liste d'attente (B3) — priorité d'attribution aux libérations. */
  async rejoindreListeAttente(dto: ListeAttenteDto) {
    const etab = await this.prisma.etablissement.findUnique({
      where: { slug: dto.etablissementSlug },
      select: { id: true, tenantId: true, statut: true },
    });
    if (!etab || etab.statut !== 'actif') throw new NotFoundException('Établissement introuvable');

    const telephone = dto.telephone.replace(/[^\d+]/g, '');
    const result = await this.prisma.withTenant(etab.tenantId, async (tx) => {
      const client = await tx.client.upsert({
        where: { telephone },
        create: { telephone, nom: dto.nom },
        update: {},
      });
      return tx.reservation.create({
        data: {
          tenantId: etab.tenantId,
          etablissementId: etab.id,
          clientId: client.id,
          creneauDebut: dto.creneauSouhaite ? new Date(dto.creneauSouhaite) : new Date(),
          creneauFin: dto.creneauSouhaite
            ? new Date(new Date(dto.creneauSouhaite).getTime() + RESA_DURATION_MIN * 60_000)
            : new Date(),
          nbPersonnes: dto.nbPersonnes,
          statut: 'en_attente',
        },
      });
    });
    this.logger.log('reservation.liste_attente', 'reservation.waitlist', {
      reservation_id: result.id,
    });
    return { reservation: result, message: 'Ajouté à la liste d\'attente' };
  }

  /** Consultation publique : id + téléphone (pas de fuite d'info). */
  async consulterPublic(tenantSlug: string, reservationId: string, telephone: string) {
    const etab = await this.prisma.etablissement.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, tenantId: true },
    });
    if (!etab) throw new NotFoundException('Établissement introuvable');
    const tel = telephone.replace(/[^\d+]/g, '');
    return this.prisma.withTenant(etab.tenantId, async (tx) => {
      const r = await tx.reservation.findFirst({
        where: { id: reservationId, etablissementId: etab.id },
        include: { client: { select: { telephone: true, nom: true } } },
      });
      if (!r || r.client.telephone !== tel) throw new NotFoundException('Réservation introuvable');
      return r;
    });
  }

  /** Créneaux du jour : capacité (places actives) vs réservations confirmées. */
  async disponibilites(slug: string, date: string) {
    const etab = await this.prisma.etablissement.findUnique({
      where: { slug },
      select: { id: true, tenantId: true, statut: true },
    });
    if (!etab || etab.statut !== 'actif') throw new NotFoundException('Établissement introuvable');
    const jour = new Date(`${date}T00:00:00`);
    const lendemain = new Date(jour.getTime() + 24 * 3600_000);

    return this.prisma.withTenant(etab.tenantId, async (tx) => {
      const [nbPlaces, resa] = await Promise.all([
        tx.place.count({ where: { etablissementId: etab.id, statut: { not: 'hors_service' } } }),
        tx.reservation.findMany({
          where: {
            etablissementId: etab.id,
            statut: 'confirmee',
            creneauDebut: { lt: lendemain },
            creneauFin: { gt: jour },
          },
          select: { creneauDebut: true, creneauFin: true, nbPersonnes: true },
        }),
      ]);
      // Créneaux 2h de 12h à 23h — TODO: générés depuis etablissement.horaires
      const slots = [];
      for (let h = 12; h <= 21; h += 2) {
        const debut = new Date(jour); debut.setHours(h, 0, 0, 0);
        const fin = new Date(debut.getTime() + RESA_DURATION_MIN * 60_000);
        const occupees = resa.filter((r) => r.creneauDebut < fin && r.creneauFin > debut);
        const placesPrises = new Set(occupees.map((r) => r.creneauDebut.toISOString())).size;
        slots.push({
          debut: debut.toISOString(),
          fin: fin.toISOString(),
          placesRestantes: Math.max(0, nbPlaces - placesPrises),
          complet: placesPrises >= nbPlaces,
        });
      }
      return { date, capacite: nbPlaces, slots };
    });
  }

  // ---------------- Staff ----------------

  list(user: AuthUser, filters: { date?: string; statut?: ReservationStatut }) {
    const where: Record<string, unknown> = { etablissementId: user.etablissementId };
    if (filters.statut) where.statut = filters.statut;
    if (filters.date) {
      const jour = new Date(`${filters.date}T00:00:00`);
      const lendemain = new Date(jour.getTime() + 24 * 3600_000);
      where.creneauDebut = { gte: jour, lt: lendemain };
    }
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.reservation.findMany({
        where,
        include: {
          client: { select: { nom: true, telephone: true } },
          place: { select: { numero: true } },
        },
        orderBy: { creneauDebut: 'asc' },
        take: 200,
      }),
    );
  }

  /** Transition staff : annulation / no-show / honorée / confirmation liste attente. */
  async updateStatut(user: AuthUser, id: string, dto: UpdateReservationStatutDto) {
    const result = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const r = await tx.reservation.findFirst({
        where: { id, etablissementId: user.etablissementId },
      });
      if (!r) throw new NotFoundException('Réservation introuvable');
      const allowed = TRANSITIONS[r.statut] ?? [];
      if (!allowed.includes(dto.statut)) {
        throw new BadRequestException(`Transition ${r.statut} → ${dto.statut} non autorisée`);
      }

      const ctx = getRequestContext();
      const updated = await tx.reservation.update({
        where: { id },
        data: { statut: dto.statut },
      });
      // Audit obligatoire pour annulation / no-show (action sensible)
      if (['annulee', 'no_show'].includes(dto.statut)) {
        await tx.auditLog.create({
          data: {
            tenantId: user.tenantId,
            utilisateurId: user.userId,
            etablissementId: user.etablissementId,
            action: `reservation.${dto.statut === 'annulee' ? 'annuler' : 'no_show'}`,
            entiteType: 'reservation',
            entiteId: id,
            avant: { statut: r.statut } as never,
            apres: { statut: dto.statut } as never,
            motif: dto.motif ?? 'non renseigné',
            requestId: ctx?.requestId,
          },
        });
      }
      return updated;
    });

    this.realtime.commandeModifiee(user.tenantId, `reservation:${id}`, {
      action: 'reservation.statut', statut: dto.statut,
    });
    this.logger.log('reservation.statut', 'reservation.update', { reservation_id: id, statut: dto.statut });
    return result;
  }
}
