import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, PermissionsGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

class ListAuditQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() entiteType?: string;
  @IsOptional() @IsUUID() utilisateurId?: string;
  @IsOptional() @IsString() dateDebut?: string; // ISO
  @IsOptional() @IsString() dateFin?: string;
}

/** Journal d'audit append-only du tenant (lecture seule, audit.lire). */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.lire')
  async list(@CurrentUser() user: AuthUser, @Query() q: ListAuditQuery) {
    const page = q.page ?? 1;
    const limit = Math.min(q.limit ?? 50, 200);
    const where = {
      ...(q.action ? { action: { contains: q.action, mode: 'insensitive' as const } } : {}),
      ...(q.entiteType ? { entiteType: q.entiteType } : {}),
      ...(q.utilisateurId ? { utilisateurId: q.utilisateurId } : {}),
      ...(q.dateDebut || q.dateFin
        ? {
            createdAt: {
              ...(q.dateDebut ? { gte: new Date(q.dateDebut) } : {}),
              ...(q.dateFin ? { lte: new Date(q.dateFin) } : {}),
            },
          }
        : {}),
    };
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const [total, items] = await Promise.all([
        tx.auditLog.count({ where }),
        tx.auditLog.findMany({
          where,
          include: { utilisateur: { select: { email: true, telephone: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return { items, total, page, limit, pages: Math.ceil(total / limit) };
    });
  }
}
