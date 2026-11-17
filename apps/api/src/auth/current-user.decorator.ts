import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface AuthUser {
  userId: string;
  tenantId: string;
  etablissementId: string;
  roleId: string;
  roleCode: string;
  permissions: string[];
  clientId?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user) return undefined;
    return data ? req.user[data] : req.user;
  },
);
