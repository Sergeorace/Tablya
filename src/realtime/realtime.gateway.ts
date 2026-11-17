import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JsonLogger } from '../common/json.logger';

/**
 * Passerelle temps réel (Socket.IO) — rooms :
 *   staff : user:{id} + tenant:{tenantId}:salle|cuisine|bar|caisse|client
 *   client: client:{id}  (JWT 'client' — suivi commande, notifications)
 * Le handshake exige un JWT valide ; tenant_id vient du token, pas du client.
 */
@Injectable()
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'], // polling = fallback réseaux instables
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly logger: JsonLogger,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    // Handshake authentifié obligatoire : le tenant et l'identité sont
    // déduits du JWT — jamais du query/auth client (anti-IDOR, A01).
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwt.verify<{
        sub?: string; client_id?: string; type?: string; tenant_id?: string;
      }>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.type === 'client') {
        // Client : room personnelle uniquement (pas de canal staff).
        if (payload.sub) {
          void client.join(`client:${payload.client_id ?? payload.sub}`);
        }
      } else {
        // Staff : room personnelle + tous les canaux du tenant du token.
        if (payload.sub) void client.join(`user:${payload.sub}`);
        if (payload.tenant_id) {
          for (const ch of ['salle', 'cuisine', 'bar', 'caisse', 'client'] as const) {
            void client.join(`tenant:${payload.tenant_id}:${ch}`);
          }
        }
      }
    } catch {
      client.disconnect(true);
      return;
    }
    Logger.log(`WS connecté ${client.id}`, 'Realtime');
  }

  handleDisconnect(client: Socket) {
    Logger.log(`WS déconnecté ${client.id}`, 'Realtime');
  }

  /** Rejoint une room métier : salle, cuisine, bar, caisse, client. */
  joinRoom(client: Socket, room: string) {
    void client.join(room);
  }

  /** Émet un événement à une room tenant. */
  emit(tenantId: string, channel: 'salle' | 'cuisine' | 'bar' | 'caisse' | 'client', event: string, payload: unknown) {
    this.server.to(`tenant:${tenantId}:${channel}`).emit(event, payload);
  }

  emitToRoom(room: string, event: string, payload: unknown) {
    this.server.to(room).emit(event, payload);
  }
}
