import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JsonLogger } from '../common/json.logger';

/**
 * Passerelle temps réel (Socket.IO) — rooms par tenant :
 *   tenant:{id}:salle | :cuisine | :bar | :caisse | :client:{commandeId}
 *
 * TODO(E3+): authentifier le handshake JWT (actuellement le join
 * repose sur le tenant_id fourni — à sécuriser avant prod, cf. §6 A01).
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
    const tenantId = client.handshake.auth?.tenantId ?? client.handshake.query?.tenantId;
    const token = client.handshake.auth?.token;
    if (token) {
      try {
        const payload = this.jwt.verify<{
          sub?: string; client_id?: string; type?: string;
        }>(token, {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        });
        // Room personnelle : staff → user:{id}, client → client:{id}.
        // (payload.sub = utilisateur.id ou client.id selon le type de token)
        if (payload.sub) {
          if (payload.type === 'client') {
            void client.join(`client:${payload.client_id ?? payload.sub}`);
          } else {
            void client.join(`user:${payload.sub}`);
          }
        }
      } catch {
        client.disconnect(true);
        return;
      }
    }
    if (tenantId) {
      void client.join(`tenant:${tenantId}`);
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
