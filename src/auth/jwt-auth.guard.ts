import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from './current-user.decorator';
import { Request } from 'express';
import { PERMISSIONS_KEY } from './permissions.decorator';

export const IS_PUBLIC_KEY = 'isPublic';
/** Route publique : pas de JWT requis (login, register, webhooks, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Guard JWT : valide le access token et attache req.user. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = AuthUser>(err: Error | null, user: TUser | false): TUser {
    if (err || !user) throw err ?? new Error('Unauthorized');
    return user;
  }
}

/** Guard RBAC : exige les permissions déclarées via @RequirePermissions. */
@Injectable()
export class PermissionsGuard {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) return false;
    // super-admin plateforme et gérant contournent (affinage E8)
    if (user.roleCode === 'super_admin' || user.roleCode === 'gerant') return true;
    return required.every((p) => user.permissions.includes(p));
  }
}
