import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { SalleModule } from './salle/salle.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { CommandesModule } from './commandes/commandes.module';
import { RealtimeModule } from './realtime/realtime.module';
import { JsonLogger } from './common/json.logger';
import { TenantMiddleware } from './common/tenant.middleware';
import { JwtAuthGuard, PermissionsGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    HealthModule,
    SalleModule,
    CatalogueModule,
    RealtimeModule,
    CommandesModule,
  ],
  providers: [
    JsonLogger,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
