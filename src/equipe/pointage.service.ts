import {
  BadRequestException, Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Redis } from 'ioredis';
import { PointageMethode, PointageStatut } from '@prisma/client';
import { AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { JsonLogger } from '../common/json.logger';
import { CorrigerPointageDto, ListPointagesQuery, PointageDto } from './dto/equipe.dto';

function hashPin(pin: string): string {
  const secret = process.env.POINTAGE_PIN_SECRET ?? process.env.JWT_ACCESS_SECRET ?? 'dev-secret';
  return createHmac('sha256', secret).update(`pointage:${pin}`).digest('hex');
}

const METHODES: Record<string, PointageMethode> = {
  pin: 'pin', qr: 'qr', gps: 'gps', manuel: 'manuel',
};

const STATUTS: Record<string, PointageStatut> = {
  present: 'present', absent: 'absent', retard: 'retard',
};

/** Tolérance de retard : > 15 min après le début du shift planifié. */
const RETARD_SEUIL_MS = 15 * 60_000;

@Injectable()
export class PointageService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: JsonLogger,
  ) {}

  /** Anti brute-force PIN : 10 tentatives / minute par hash PIN + IP. */
  private async checkRateLimit(cle: string) {
    const n = await this.redis.incr(`pointage_rl:${cle}`);
    if (n === 1) await this.redis.expire(`pointage_rl:${cle}`, 60);
    if (n > 10) throw new UnauthorizedException('Trop de tentatives — réessayez dans une minute');
  }

  /**
   * Pointage self-service — @Public (PIN/QR/GPS font foi d'identité).
   * Idempotent : un second "arrivée" le même jour retourne le pointage existant.
   */
  async pointer(dto: PointageDto, ip?: string) {
    if (dto.methode === 'manuel') {
      throw new BadRequestException('Pointage manuel réservé au staff habilité');
    }
    const employe = await this.resolveEmploye(dto, ip);
    const sens = dto.sens ?? 'arrivee';
    return sens === 'depart'
      ? this.pointerDepart(employe.id, dto.methode)
      : this.pointerArrivee(employe.id, dto.methode);
  }

  private async resolveEmploye(dto: PointageDto, ip?: string) {
    if (dto.methode === 'pin') {
      if (!dto.pin) throw new BadRequestException('PIN requis');
      const hash = hashPin(dto.pin);
      await this.checkRateLimit(`${hash}:${ip ?? 'na'}`);
      // Lookup cross-tenant : le PIN identifie employé + tenant.
      const employe = await this.prisma.platform((tx) =>
        tx.employe.findFirst({ where: { pointagePinHash: hash } }),
      );
      if (!employe) throw new UnauthorizedException('PIN invalide');
      return employe;
    }
    // qr = employe.id (badge opaque UUID) ; gps/manuel = employeId explicite.
    if (!dto.employeId) {
      throw new BadRequestException('employeId requis pour qr/gps/manuel');
    }
    const employe = await this.prisma.platform((tx) =>
      tx.employe.findUnique({ where: { id: dto.employeId } }),
    );
    if (!employe) throw new NotFoundException('Employé introuvable');
    if (dto.methode === 'gps') {
      // TODO : géorepérage — valider distance vs coordonnées de l'établissement.
      // MVP : on logue les coords (jamais dans les champs métier) sans rejeter.
      this.logger.warn('pointage.gps_unverified', 'equipe.pointage', { employe_id: employe.id });
    }
    return employe;
  }

  private async pointerArrivee(employeId: string, methodeStr: string) {
    const methode = METHODES[methodeStr] ?? 'pin';
    const now = new Date();
    const today = new Date(now); today.setUTCHours(0, 0, 0, 0);

    const resultat = await this.prisma.platform(async (tx) => {
      const e = await tx.employe.findUnique({ where: { id: employeId } });
      if (!e) throw new NotFoundException('Employé introuvable');
      // Idempotence : arrivée déjà ouverte aujourd'hui → retourner l'existant.
      const existant = await tx.pointage.findFirst({
        where: { employeId, heureArrivee: { gte: today }, heureDepart: null },
      });
      if (existant) return { existant, cree: null, statut: existant.statut };
      // Retard si le shift planifié a débuté > 15 min avant l'arrivée.
      const planning = await tx.planning.findFirst({
        where: {
          employeId,
          jour: today,
          statut: { in: ['planifie', 'confirme'] },
        },
        orderBy: { debut: 'asc' },
      });
      const enRetard = planning
        ? now.getTime() > planning.debut.getTime() + RETARD_SEUIL_MS
        : false;
      const statut = enRetard ? 'retard' : 'present';
      const cree = await tx.pointage.create({
        data: {
          tenantId: e.tenantId,
          employeId,
          utilisateurId: e.utilisateurId,
          heureArrivee: now,
          methode,
          statut,
          planningId: planning?.id ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: e.tenantId,
          action: 'pointage.arrivee',
          entiteType: 'pointage',
          entiteId: cree.id,
          apres: { employe_id: employeId, methode, statut },
        },
      });
      return { existant: null, cree, statut };
    });

    if (resultat.existant) {
      return { deja_pointe: true, pointage: resultat.existant };
    }
    this.logger.log('pointage.arrivee', 'equipe.pointage', {
      employe_id: employeId, methode, statut: resultat.statut,
    });
    return { deja_pointe: false, statut: resultat.statut, pointage: resultat.cree };
  }

  private async pointerDepart(employeId: string, methodeStr: string) {
    const methode = METHODES[methodeStr] ?? 'pin';
    const now = new Date();
    const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
    return this.prisma.platform(async (tx) => {
      const open = await tx.pointage.findFirst({
        where: { employeId, heureArrivee: { gte: today }, heureDepart: null },
        orderBy: { heureArrivee: 'desc' },
      });
      if (!open) {
        throw new BadRequestException('Aucun pointage d\'arrivée ouvert aujourd\'hui');
      }
      const maj = await tx.pointage.update({
        where: { id: open.id },
        data: { heureDepart: now, methode },
      });
      await tx.auditLog.create({
        data: {
          tenantId: open.tenantId,
          action: 'pointage.depart',
          entiteType: 'pointage',
          entiteId: open.id,
          apres: { employe_id: employeId, methode },
        },
      });
      return { deja_pointe: false, pointage: maj };
    });
  }

  /** Liste journalière — manager (employe.gerer). */
  async list(user: AuthUser, query: ListPointagesQuery) {
    const date = new Date(query.date);
    const lendemain = new Date(date); lendemain.setUTCDate(lendemain.getUTCDate() + 1);
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.pointage.findMany({
        where: {
          tenantId: user.tenantId,
          heureArrivee: { gte: date, lt: lendemain },
          employe: { etablissementId: user.etablissementId },
          ...(query.employeId ? { employeId: query.employeId } : {}),
        },
        include: {
          employe: { select: { id: true, nom: true, prenom: true, poste: true } },
        },
        orderBy: { heureArrivee: 'asc' },
      }),
    );
  }

  /** Correction tracée — motif obligatoire + audit avant/après. */
  async corriger(user: AuthUser, id: string, dto: CorrigerPointageDto) {
    if (!dto.heureArrivee && !dto.heureDepart && !dto.statut) {
      throw new BadRequestException('Rien à corriger');
    }
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const p = await tx.pointage.findFirst({
        where: { id, employe: { etablissementId: user.etablissementId } },
      });
      if (!p) throw new NotFoundException('Pointage introuvable');
      const updated = await tx.pointage.update({
        where: { id },
        data: {
          ...(dto.heureArrivee ? { heureArrivee: new Date(dto.heureArrivee) } : {}),
          ...(dto.heureDepart ? { heureDepart: new Date(dto.heureDepart) } : {}),
          ...(dto.statut ? { statut: STATUTS[dto.statut] ?? 'present' } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          utilisateurId: user.userId,
          etablissementId: user.etablissementId,
          action: 'pointage.corriger',
          entiteType: 'pointage',
          entiteId: id,
          motif: dto.motif,
          avant: {
            arrivee: p.heureArrivee, depart: p.heureDepart, statut: p.statut,
          } as never,
          apres: {
            arrivee: updated.heureArrivee, depart: updated.heureDepart, statut: updated.statut,
          } as never,
        },
      });
      return updated;
    });
  }

  /** Pointage manuel par un staff habilité (kiosque / assistance). */
  async pointerManuel(user: AuthUser, dto: PointageDto) {
    if (!dto.employeId) throw new BadRequestException('employeId requis');
    const employe = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.employe.findFirst({
        where: { id: dto.employeId, etablissementId: user.etablissementId },
      }),
    );
    if (!employe) throw new NotFoundException('Employé introuvable');
    const sens = dto.sens ?? 'arrivee';
    const result = sens === 'depart'
      ? await this.pointerDepart(employe.id, 'manuel')
      : await this.pointerArrivee(employe.id, 'manuel');
    this.logger.log('pointage.manuel', 'equipe.pointage', { tenant_id: user.tenantId, employe_id: employe.id, sens });
    return result;
  }
}
