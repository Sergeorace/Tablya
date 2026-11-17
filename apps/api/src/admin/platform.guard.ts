import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../auth/jwt-auth.guard';
import { AuthUser } from '../auth/current-user.decorator';

/**
 * Réservé au super-admin plateforme (roleCode='super_admin').
 * Le PermissionsGuard laisse passer 'gerant' — insuffisant pour /admin/*.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (req.user?.roleCode !== 'super_admin') {
      throw new ForbiddenException('Réservé au super-admin plateforme');
    }
    return true;
  }
}
