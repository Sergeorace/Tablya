import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Accès base de données en deux rôles :
 *
 * - `this` (client principal, DATABASE_URL = rôle propriétaire/superuser
 *   `tablya`) : bypass RLS — réservé à `platform()` (webhooks, lookups
 *   publics, auth pré-tenant) et aux requêtes directes hors tenant.
 * - `app` (DATABASE_APP_URL = rôle `tablya_app` sans BYPASSRLS) :
 *   utilisé par `withTenant()` — la RLS est réellement appliquée sur
 *   tout le chemin métier (défense en profondeur au-delà du filtrage
 *   applicatif).
 *
 * Si DATABASE_APP_URL est absent, `app` retombe sur DATABASE_URL et la
 * RLS n'est pas appliquée (mode dégradé, même comportement qu'avant).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly app: PrismaClient;

  constructor() {
    super();
    this.app = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_APP_URL ??
            process.env.DATABASE_URL ??
            'postgresql://localhost:5432/tablya',
        },
      },
    });
  }

  async onModuleInit() {
    await Promise.all([this.$connect(), this.app.$connect()]);
  }

  async onModuleDestroy() {
    await Promise.all([this.$disconnect(), this.app.$disconnect()]);
  }

  /**
   * Exécute fn dans une transaction avec le contexte tenant RLS.
   * `set_config('app.tenant_id', …, true)` est scopé à la transaction
   * et la policy `tenant_isolation` filtre les lignes côté PostgreSQL.
   */
  async withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Contexte plateforme : client privilégié (bypass RLS).
   * Usage strictement réservé : webhooks fournisseurs, lookup public
   * slug→tenant, auth avant résolution du tenant, super-admin.
   */
  async platform<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(fn);
  }
}
