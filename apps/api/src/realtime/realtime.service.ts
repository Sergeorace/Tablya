import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

type Channel = 'salle' | 'cuisine' | 'bar' | 'caisse';

/**
 * Service d'émission temps réel — appelé par les modules métier.
 * Convention d'événements (docs/01) :
 *   commande.nouvelle | commande.modifiee | commande.statut
 *   place.statut_change | paiement.confirme | sync.terminee
 */
@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  commandeNouvelle(
    tenantId: string,
    commande: { id: string; placeId?: string | null; totalCentimes: number; clientId?: string | null },
  ) {
    const channels: Channel[] = ['cuisine', 'bar', 'caisse', 'salle'];
    for (const ch of channels) {
      this.gateway.emit(tenantId, ch, 'commande.nouvelle', commande);
    }
    if (commande.placeId) {
      this.gateway.emitToRoom(`tenant:${tenantId}:client:${commande.id}`, 'commande.statut', commande);
    }
    if (commande.clientId) {
      this.gateway.emitToRoom(`client:${commande.clientId}`, 'commande.nouvelle', commande);
    }
  }

  commandeModifiee(tenantId: string, commandeId: string, payload: unknown) {
    this.gateway.emit(tenantId, 'cuisine', 'commande.modifiee', { commandeId, ...(payload as object) });
    this.gateway.emit(tenantId, 'bar', 'commande.modifiee', { commandeId, ...(payload as object) });
    this.gateway.emit(tenantId, 'caisse', 'commande.modifiee', { commandeId, ...(payload as object) });
  }

  commandeStatut(
    tenantId: string,
    commandeId: string,
    statut: string,
    extra?: Record<string, unknown>,
    clientId?: string | null,
  ) {
    const payload = { commandeId, statut, ...extra };
    for (const ch of ['cuisine', 'bar', 'caisse', 'salle'] as Channel[]) {
      this.gateway.emit(tenantId, ch, 'commande.statut', payload);
    }
    this.gateway.emitToRoom(`tenant:${tenantId}:client:${commandeId}`, 'commande.statut', payload);
    // Room personnelle du client (JWT 'client' → client:{id}).
    if (clientId) {
      this.gateway.emitToRoom(`client:${clientId}`, 'commande.statut', payload);
    }
  }

  /** Émission vers une room arbitraire (ex. user:{id}, client:{id}). */
  emitToRoom(room: string, event: string, payload: unknown) {
    this.gateway.emitToRoom(room, event, payload);
  }

  placeStatutChange(tenantId: string, placeId: string, statut: string, numero?: string) {
    this.gateway.emit(tenantId, 'salle', 'place.statut_change', { placeId, statut, numero });
  }
}
