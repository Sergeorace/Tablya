import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../common/als';

export interface CreerRoleDto {
  code: string;
  nom: string;
  description?: string;
  permissionIds: string[];
}

export interface MajRoleDto {
  nom?: string;
  description?: string;
  permissionIds?: string[];
}

/** Rôles custom du tenant + rôles système (tenant_id NULL) en lecture. */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rôles visibles : système (tenant_id NULL) + rôles du tenant. */
  list(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.role.findMany({
        where: {
          OR: [{ tenantId: null }, { tenantId: user.tenantId }],
        },
        include: {
          permissions: { include: { permission: { select: { id: true, code: true, module: true, description: true } } } },
          _count: { select: { utilisateurs: true } },
        },
        orderBy: [{ systeme: 'desc' }, { nom: 'asc' }],
      }),
    );
  }

  async creer(user: AuthUser, dto: CreerRoleDto) {
    const code = dto.code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!code) throw new BadRequestException('Code de rôle invalide');
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existant = await tx.role.findFirst({
        where: { tenantId: user.tenantId, code },
      });
      if (existant) throw new BadRequestException('Ce code de rôle existe déjà');
      await this.assertPermissions(tx, user.tenantId, dto.permissionIds);

      const role = await tx.role.create({
        data: {
          tenantId: user.tenantId,
          etablissementId: user.etablissementId,
          code,
          nom: dto.nom,
          description: dto.description,
          systeme: false,
          permissions: {
            create: dto.permissionIds.map((permissionId) => ({
              permissionId,
              tenantId: user.tenantId,
            })),
          },
        },
        include: { permissions: { include: { permission: true } } },
      });
      await this.audit(tx, user, 'role.creer', role.id, null, { code, nom: dto.nom });
      return role;
    });
  }

  async maj(user: AuthUser, roleId: string, dto: MajRoleDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, tenantId: user.tenantId },
        include: { permissions: true },
      });
      if (!role) throw new NotFoundException('Rôle introuvable');
      if (role.systeme) throw new BadRequestException('Les rôles système ne sont pas modifiables');

      if (dto.permissionIds) {
        await this.assertPermissions(tx, user.tenantId, dto.permissionIds);
        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (dto.permissionIds.length) {
          await tx.rolePermission.createMany({
            data: dto.permissionIds.map((permissionId) => ({
              roleId, permissionId, tenantId: user.tenantId,
            })),
          });
        }
      }
      const maj = await tx.role.update({
        where: { id: roleId },
        data: {
          ...(dto.nom !== undefined ? { nom: dto.nom } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        },
        include: { permissions: { include: { permission: true } } },
      });
      await this.audit(tx, user, 'role.modifier', roleId,
        { permissions: role.permissions.map((p) => p.permissionId) },
        { permissions: dto.permissionIds ?? role.permissions.map((p) => p.permissionId) });
      return maj;
    });
  }

  /** Référentiel des permissions disponibles pour l'UI de composition. */
  permissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  }

  private async assertPermissions(tx: Prisma.TransactionClient, tenantId: string, ids: string[]) {
    if (!ids.length) return;
    const count = await tx.permission.count({ where: { id: { in: ids } } });
    if (count !== new Set(ids).size) {
      throw new BadRequestException('Une ou plusieurs permissions sont invalides');
    }
  }

  private async audit(
    tx: Prisma.TransactionClient, user: AuthUser,
    action: string, roleId: string, avant: unknown, apres: unknown,
  ) {
    const ctx = getRequestContext();
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        utilisateurId: user.userId,
        etablissementId: user.etablissementId,
        action,
        entiteType: 'role',
        entiteId: roleId,
        avant: avant as never,
        apres: apres as never,
        requestId: ctx?.requestId,
      },
    });
  }
}
