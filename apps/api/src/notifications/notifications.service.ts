import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { JsonLogger } from '../common/json.logger';

export type Canal = 'interne' | 'sms' | 'email' | 'push';

export interface EnvoyerParams {
  tenantId?: string;
  utilisateurId?: string;
  clientId?: string;
  canal: Canal;
  type: string;
  titre: string;
  corps: string;
  metadata?: Record<string, unknown>;
}

/**
 * Notifications multi-canal.
 * - 'interne' : persistée + poussée Socket.IO (room user:{id} / client:{id})
 * - 'sms'/'email'/'push' : stub provider (TODO E9+ : passerelle SMS locale,
 *   FCM/APNs, SMTP transactionnel) — tracée en base + log, jamais de contenu PII.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly logger: JsonLogger,
  ) {}

  async envoyer(p: EnvoyerParams) {
    const notif = await this.prisma.platform((tx) =>
      tx.notification.create({
        data: {
          tenantId: p.tenantId ?? null,
          utilisateurId: p.utilisateurId ?? null,
          clientId: p.clientId ?? null,
          canal: p.canal,
          type: p.type,
          titre: p.titre,
          corps: p.corps,
          metadata: (p.metadata ?? {}) as Prisma.InputJsonValue,
        },
      }),
    );
    // Push temps réel pour le canal interne.
    if (p.canal === 'interne') {
      if (p.utilisateurId) {
        this.realtime.emitToRoom(`user:${p.utilisateurId}`, 'notification.nouvelle', {
          id: notif.id, type: p.type, titre: p.titre, corps: p.corps,
        });
      }
      if (p.clientId) {
        this.realtime.emitToRoom(`client:${p.clientId}`, 'notification.nouvelle', {
          id: notif.id, type: p.type, titre: p.titre, corps: p.corps,
        });
      }
    } else {
      // Stub providers externes — log structuré sans destinataire en clair.
      this.logger.log(`notification.${p.canal}_stub`, 'notifications.envoyer', {
        type: p.type, notification_id: notif.id,
      });
    }
    return notif;
  }

  // ---------- Consultation ----------

  async listerPourUtilisateur(utilisateurId: string, nonLuesOnly = false) {
    return this.prisma.platform((tx) =>
      tx.notification.findMany({
        where: {
          utilisateurId,
          canal: 'interne',
          ...(nonLuesOnly ? { lueAt: null } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  }

  async listerPourClient(clientId: string, nonLuesOnly = false) {
    return this.prisma.platform((tx) =>
      tx.notification.findMany({
        where: {
          clientId,
          canal: 'interne',
          ...(nonLuesOnly ? { lueAt: null } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
  }

  async marquerLue(id: string, proprietaire: { utilisateurId?: string; clientId?: string }) {
    const notif = await this.prisma.platform((tx) =>
      tx.notification.findFirst({
        where: {
          id,
          ...(proprietaire.utilisateurId ? { utilisateurId: proprietaire.utilisateurId } : {}),
          ...(proprietaire.clientId ? { clientId: proprietaire.clientId } : {}),
        },
      }),
    );
    if (!notif) return null;
    if (notif.lueAt) return notif;
    return this.prisma.platform((tx) =>
      tx.notification.update({ where: { id }, data: { lueAt: new Date() } }),
    );
  }

  async marquerToutesLues(proprietaire: { utilisateurId?: string; clientId?: string }) {
    const res = await this.prisma.platform((tx) =>
      tx.notification.updateMany({
        where: {
          lueAt: null,
          ...(proprietaire.utilisateurId ? { utilisateurId: proprietaire.utilisateurId } : {}),
          ...(proprietaire.clientId ? { clientId: proprietaire.clientId } : {}),
        },
        data: { lueAt: new Date() },
      }),
    );
    return { marquees: res.count };
  }

  // ---------- Cron : rappels de réservation J-2h ----------

  /**
   * Toutes les 30 min : réservations confirmées débutant dans ~2 h
   * (fenêtre 110–130 min) → SMS rappel + notification interne.
   */
  @Cron('*/30 * * * *')
  async rappelsReservations() {
    const maintenant = Date.now();
    const min = new Date(maintenant + 110 * 60_000);
    const max = new Date(maintenant + 130 * 60_000);
    const reservations = await this.prisma.platform((tx) =>
      tx.reservation.findMany({
        where: {
          statut: 'confirmee',
          rappelEnvoyeAt: null,
          creneauDebut: { gte: min, lte: max },
        },
        include: { client: { select: { id: true, telephone: true } } },
        take: 100,
      }),
    );
    for (const r of reservations) {
      try {
        await this.envoyer({
          tenantId: r.tenantId,
          clientId: r.clientId,
          canal: 'sms',
          type: 'reservation.rappel',
          titre: 'Rappel de réservation',
          corps: `Votre table est réservée à ${r.creneauDebut.toISOString()} pour ${r.nbPersonnes} personne(s).`,
          metadata: { reservation_id: r.id },
        });
        await this.envoyer({
          tenantId: r.tenantId,
          clientId: r.clientId,
          canal: 'interne',
          type: 'reservation.rappel',
          titre: 'Rappel de réservation',
          corps: `Votre table vous attend à ${r.creneauDebut.toISOString()}.`,
        });
        await this.prisma.platform((tx) =>
          tx.reservation.update({
            where: { id: r.id },
            data: { rappelEnvoyeAt: new Date() },
          }),
        );
      } catch (err) {
        this.logger.error(
          'notification.rappel_echec', undefined, 'notifications.rappel',
          { reservation_id: r.id, erreur: err instanceof Error ? err.message : 'inconnue' },
        );
      }
    }
    if (reservations.length) {
      this.logger.log('notifications.rappels', 'notifications.rappel', {
        envoyes: reservations.length,
      });
    }
  }
}
