import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
/**
 * Exige les permissions RBAC (format "module.action", ex. "commande.annuler").
 * À combiner avec @UseGuards(JwtAuthGuard, PermissionsGuard).
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
