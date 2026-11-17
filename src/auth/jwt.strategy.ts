import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from './current-user.decorator';

export interface JwtPayload {
  sub: string;          // userId
  tenant_id: string;
  etablissement_id: string;
  role_id: string;
  role: string;
  permissions: string[];
  jti: string;
  type: 'access' | 'refresh';
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
