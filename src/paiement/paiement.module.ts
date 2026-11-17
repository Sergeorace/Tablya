import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PaiementService, PAYMENT_QUEUE } from './paiement.service';
import { PaiementProcessor } from './paiement.processor';
import { PaiementController } from './paiement.controller';
import { FedapayProvider } from './providers/fedapay.provider';
import { CinetpayProvider } from './providers/cinetpay.provider';
import { RealtimeModule } from '../realtime/realtime.module';

function redisConnection(config: ConfigService) {
  const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname ? Number(u.pathname.slice(1)) || 0 : 0,
    maxRetriesPerRequest: null,
  };
}

@Module({
  imports: [
    RealtimeModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ connection: redisConnection(config) }),
    }),
    BullModule.registerQueueAsync({
      name: PAYMENT_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config),
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      }),
    }),
  ],
  controllers: [PaiementController],
  providers: [PaiementService, PaiementProcessor, FedapayProvider, CinetpayProvider],
  exports: [PaiementService],
})
export class PaiementModule {}
