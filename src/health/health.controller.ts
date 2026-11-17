import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Redis } from 'ioredis';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const [db, cache] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    return {
      status: db.status === 'fulfilled' && cache.status === 'fulfilled' ? 'ok' : 'degraded',
      db: db.status === 'fulfilled' ? 'up' : 'down',
      redis: cache.status === 'fulfilled' ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }
}
