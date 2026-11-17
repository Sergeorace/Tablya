import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { SalleModule } from './salle/salle.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { CommandesModule } from './commandes/commandes.module';
import { PaiementModule } from './paiement/paiement.module';
import { ClientsModule } from './clients/clients.module';
import { ReservationsModule } from './reservations/reservations.module';
import { RealtimeModule } from './realtime/realtime.module';
import { EquipeModule } from './equipe/equipe.module';
import { PaieModule } from './paie/paie.module';
import { PilotageModule } from './pilotage/pilotage.module';
import { AdminModule } from './admin/admin.module';
import { CommonModule } from './common/common.module';
import { TenantMiddleware } from './common/tenant.middleware';
import { JwtAuthGuard, PermissionsGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    CommonModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    HealthModule,
    SalleModule,
    CatalogueModule,
    RealtimeModule,
    EquipeModule,
    PaieModule,
    PilotageModule,
    AdminModule,
    CommandesModule,
    PaiementModule,
    ClientsModule,
    ReservationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
