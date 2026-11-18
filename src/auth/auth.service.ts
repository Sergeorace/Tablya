import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { LoginDto } from './dto/login.dto';
import { RegisterEtablissementDto } from './dto/register-etablissement.dto';
import { JsonLogger } from '../common/json.logger';
import { getRequestContext } from '../common/als';
import { JwtPayload } from './jwt.strategy';
import { AuthUser } from './current-user.decorator';

const REFRESH_PREFIX = 'refresh:';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: JsonLogger,
  ) {}

  /** Inscription d'un établissement (module A1) — crée tenant + gérant + abonnement essai. */
  async registerEtablissement(dto: RegisterEtablissementDto) {
    const slug = dto.slug ?? this.slugify(dto.raisonSociale);
    const tenantId = randomUUID();
    const passwordHash = await hash(dto.gerant.password);

    const result = await this.prisma.$transaction(async (tx) => {
      // Unicité slug
      const existing = await tx.etablissement.findUnique({ where: { slug } });
      if (existing) throw new UnauthorizedException('Ce slug est déjà utilisé');

      const etablissement = await tx.etablissement.create({
        data: {
          tenantId,
          raisonSociale: dto.raisonSociale,
          rccm: dto.rccm,
          nif: dto.nif,
          slug,
          devise: dto.devise ?? 'XOF',
          langues: dto.langues ?? ['fr'],
          horaires: (dto.horaires ?? undefined) as never,
          statut: 'en_attente',
        },
      });

      // Rôle gérant du tenant + toutes les permissions
      const permissions = await tx.permission.findMany();
      const role = await tx.role.create({
        data: {
          tenantId,
          etablissementId: etablissement.id,
          code: 'gerant',
          nom: 'Gérant principal',
          // Rôle protégé : non modifiable via /roles (anti auto-verrouillage RBAC).
          systeme: true,
        },
      });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({
            roleId: role.id,
            permissionId: p.id,
            tenantId,
          })),
        });
      }

      const utilisateur = await tx.utilisateur.create({
        data: {
          tenantId,
          etablissementId: etablissement.id,
          roleId: role.id,
          email: dto.gerant.email,
          telephone: dto.gerant.telephone,
          motDePasseHash: passwordHash,
        },
      });

      await tx.abonnement.create({
        data: {
          tenantId,
          etablissementId: etablissement.id,
          plan: dto.plan ?? 'starter',
          statut: 'essai',
          montantCentimes: 0,
        },
      });

      // Portefeuille virtuel du tenant
      await tx.portefeuille.create({
        data: { tenantId, etablissementId: etablissement.id },
      });

      return { etablissement, utilisateur };
    });

    this.logger.log('etablissement.inscrit', 'auth.register', {
      slug,
      tenant_id: tenantId,
      plan: dto.plan ?? 'starter',
    });

    return {
      etablissementId: result.etablissement.id,
      tenantId,
      slug,
      statut: 'en_attente',
      message: 'Établissement enregistré. En attente de validation par la plateforme.',
    };
  }

  private slugify(nom: string): string {
    const base = nom
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 30);
    return `${base}-${randomUUID().slice(0, 6)}`;
  }

  /** Login : tenant (slug) + email + mot de passe → access + refresh. */
  async login(dto: LoginDto) {
    // Résolution tenant via slug (contexte public — pas de RLS ici,
    // le rôle DB applicatif filtrera ensuite via SET app.tenant_id)
    const etablissement = await this.prisma.etablissement.findUnique({
      where: { slug: dto.tenant },
    });
    const tenantId = etablissement?.tenantId ?? dto.tenant; // fallback: tenant_id direct

    const utilisateur = await this.prisma.utilisateur.findFirst({
      where: { tenantId, email: dto.email.toLowerCase() },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        etablissement: true,
      },
    });

    if (!utilisateur?.motDePasseHash) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    const ok = await verify(utilisateur.motDePasseHash, dto.password);
    if (!ok) {
      this.logger.warn('auth.login.echec', 'auth.login', { tenant_id: tenantId });
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (utilisateur.etablissement.statut !== 'actif' && utilisateur.role.code !== 'super_admin') {
      throw new UnauthorizedException('Établissement non encore activé');
    }

    const permissions = utilisateur.role.permissions.map((rp) => rp.permission.code);
    const tokens = await this.issueTokens({
      userId: utilisateur.id,
      tenantId,
      etablissementId: utilisateur.etablissementId,
      roleId: utilisateur.roleId,
      roleCode: utilisateur.role.code,
      permissions,
    });

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { dernierLoginAt: new Date() },
    });

    const ctx = getRequestContext();
    if (ctx) {
      ctx.tenantId = tenantId;
      ctx.userId = utilisateur.id;
    }
    this.logger.log('auth.login.succes', 'auth.login', { tenant_id: tenantId });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      user: {
        id: utilisateur.id,
        email: utilisateur.email,
        role: utilisateur.role.code,
        etablissement: utilisateur.etablissement.raisonSociale,
        permissions,
      },
    };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalide');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Token invalide');

    const key = `${REFRESH_PREFIX}${payload.sub}:${payload.jti}`;
    const stored = await this.redis.get(key);
    if (!stored) throw new UnauthorizedException('Session expirée ou révoquée');

    // Rotation : on révoque l'ancien et on en émet un nouveau
    await this.redis.del(key);
    return this.issueTokens({
      userId: payload.sub,
      tenantId: payload.tenant_id,
      etablissementId: payload.etablissement_id,
      roleId: payload.role_id,
      roleCode: payload.role,
      permissions: payload.permissions,
    });
  }

  async logout(userId: string, refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      await this.redis.del(`${REFRESH_PREFIX}${userId}:${payload.jti}`);
    } catch {
      // best-effort
    }
    this.logger.log('auth.logout', 'auth.logout', { user_id: userId });
    return { ok: true };
  }

  async me(user: AuthUser) {
    const u = await this.prisma.utilisateur.findUnique({
      where: { id: user.userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    return {
      id: u?.id,
      role: u?.role.code,
      permissions: u?.role.permissions.map((rp) => rp.permission.code) ?? [],
    };
  }

  private async issueTokens(identity: {
    userId: string; tenantId: string; etablissementId: string;
    roleId: string; roleCode: string; permissions: string[];
  }) {
    const jti = randomUUID();
    const base = {
      sub: identity.userId,
      tenant_id: identity.tenantId,
      etablissement_id: identity.etablissementId,
      role_id: identity.roleId,
      role: identity.roleCode,
      permissions: identity.permissions,
      jti,
    };
    const accessToken = await this.jwt.signAsync(
      { ...base, type: 'access' },
      { expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, type: 'refresh' },
      { expiresIn: `${this.config.get<string>('JWT_REFRESH_TTL_DAYS', '30')}d` },
    );

    const ttlDays = Number(this.config.get('JWT_REFRESH_TTL_DAYS', 30));
    await this.redis.set(
      `${REFRESH_PREFIX}${identity.userId}:${jti}`,
      '1',
      'EX',
      ttlDays * 24 * 3600,
    );
    return { accessToken, refreshToken };
  }
}
