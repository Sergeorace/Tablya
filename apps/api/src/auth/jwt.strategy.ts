import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from './current-user.decorator';

export interface JwtPayload {
  sub: string;          // userId (staff) ou clientId (client)
  tenant_id: string;
  etablissement_id: string;
  role_id: string;
  role: string;
  permissions: string[];
  jti: string;
  client_id?: string;   // présent uniquement pour les tokens 'client'
  type: 'access' | 'refresh' | 'client';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (payload.type === 'client') {
      // Token client : identité = client_id, pas de tenant/permissions staff
      return {
        userId: payload.sub,
        tenantId: '',
        etablissementId: '',
        roleId: '',
        roleCode: 'client',
        permissions: [],
        clientId: payload.client_id ?? payload.sub,
      };
    }
    if (payload.type !== 'access') throw new UnauthorizedException('Token invalide');
    return {
      userId: payload.sub,
      tenantId: payload.tenant_id,
      etablissementId: payload.etablissement_id,
      roleId: payload.role_id,
      roleCode: payload.role,
      permissions: payload.permissions ?? [],
    };
  }
}
