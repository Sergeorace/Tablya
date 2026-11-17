import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createHash, randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { JsonLogger } from '../common/json.logger';
import { DemanderOtpDto, VerifierOtpDto } from './dto/client.dto';

const OTP_PREFIX = 'otp:client:';
const OTP_TTL = 300; // 5 min
const OTP_MAX_ATTEMPTS = 5;

/**
 * Auth client par OTP SMS (B8 — compte client).
 * - OTP 6 chiffres, hashé SHA-256 en Redis, TTL 5 min, usage unique
 * - max 5 tentatives puis invalidation
 * - JWT 'client' 7 jours (pas de refresh pour le MVP — TODO E9)
 * - SMS : stub provider ; en dev le code est retourné si aucun provider
 */
@Injectable()
export class ClientAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: JsonLogger,
  ) {}

  async demanderOtp(dto: DemanderOtpDto) {
    const telephone = this.normalizePhone(dto.telephone);
    // Anti-spam : 1 OTP / 60 s par numéro
    const cooldown = await this.redis.get(`${OTP_PREFIX}cooldown:${telephone}`);
    if (cooldown) throw new BadRequestException('Veuillez patienter avant de redemander un code');

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const hash = createHash('sha256').update(`${telephone}:${code}`).digest('hex');
    await this.redis.set(`${OTP_PREFIX}${telephone}`, hash, 'EX', OTP_TTL);
    await this.redis.set(`${OTP_PREFIX}cooldown:${telephone}`, '1', 'EX', 60);
    await this.redis.set(`${OTP_PREFIX}attempts:${telephone}`, '0', 'EX', OTP_TTL);

    // TODO(E9): envoi SMS réel via provider (Africa's Talking / Twilio)
    const smsKey = this.config.get<string>('SMS_PROVIDER_API_KEY');
    if (smsKey) {
      this.logger.log('otp.sms_stub', 'client.otp', { telephone });
      // await smsProvider.send(telephone, `Votre code Tablya : ${code}`);
    } else {
      this.logger.warn('otp.sms_non_configure', 'client.otp', { telephone });
    }

    return {
      message: 'Code envoyé par SMS',
      // Dev uniquement : pas de SMS provider configuré → code visible
      ...(this.config.get('NODE_ENV') !== 'production' && !smsKey ? { devCode: code } : {}),
    };
  }

  async verifierOtp(dto: VerifierOtpDto) {
    const telephone = this.normalizePhone(dto.telephone);
    const attemptsKey = `${OTP_PREFIX}attempts:${telephone}`;
    const attempts = Number(await this.redis.get(attemptsKey) ?? '0');
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await this.redis.del(`${OTP_PREFIX}${telephone}`);
      throw new UnauthorizedException('Trop de tentatives — redemandez un code');
    }

    const stored = await this.redis.get(`${OTP_PREFIX}${telephone}`);
    const hash = createHash('sha256').update(`${telephone}:${dto.code}`).digest('hex');
    if (!stored || stored !== hash) {
      await this.redis.incr(attemptsKey);
      throw new UnauthorizedException('Code invalide');
    }

    // Usage unique : suppression immédiate
    await this.redis.del(`${OTP_PREFIX}${telephone}`, `${OTP_PREFIX}attempts:${telephone}`);

    // Find-or-create client (entité globale, pas de tenant_id)
    let client = await this.prisma.client.findUnique({ where: { telephone } });
    if (!client) {
      client = await this.prisma.client.create({
        data: {
          telephone,
          nom: dto.nom,
          email: dto.email?.toLowerCase(),
          languePreferee: dto.languePreferee ?? 'fr',
        },
      });
    } else if (dto.nom || dto.email) {
      client = await this.prisma.client.update({
        where: { id: client.id },
        data: {
          ...(dto.nom ? { nom: dto.nom } : {}),
          ...(dto.email ? { email: dto.email.toLowerCase() } : {}),
          ...(dto.languePreferee ? { languePreferee: dto.languePreferee } : {}),
        },
      });
    }

    const token = await this.jwt.signAsync(
      {
        sub: client.id,
        client_id: client.id,
        type: 'client',
        jti: randomUUID(),
      },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '7d',
      },
    );

    this.logger.log('client.otp.verified', 'client.login', { client_id: client.id });
    return {
      accessToken: token,
      expiresIn: '7d',
      client: { id: client.id, telephone: client.telephone, nom: client.nom },
    };
  }

  private normalizePhone(tel: string): string {
    // Normalisation minimale : garde chiffres et '+' initial
    const cleaned = tel.replace(/[^\d+]/g, '');
    if (cleaned.length < 8) throw new BadRequestException('Numéro de téléphone invalide');
    return cleaned;
  }
}
