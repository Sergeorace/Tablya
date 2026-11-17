import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JsonLogger } from '../common/json.logger';
import { CreatePlanningDto, ListPlanningQuery, UpdatePlanningDto } from './dto/equipe.dto';

/** Fusionne jour + HH:mm en DateTime UTC (le serveur tourne en UTC). */
function combineDateTime(jour: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(jour);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  async list(user: AuthUser, query: ListPlanningQuery) {
    const debut = new Date(query.debut);
    const fin = new Date(query.fin);
    if (fin < debut) throw new BadRequestException('fin doit être ≥ debut');
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.planning.findMany({
        where: {
          tenantId: user.tenantId,
          jour: { gte: debut, lte: fin },
          ...(query.employeId ? { employeId: query.employeId } : {}),
          employe: { etablissementId: user.etablissementId },
        },
        include: {
          employe: { select: { id: true, nom: true, prenom: true, poste: true } },
        },
        orderBy: [{ jour: 'asc' }, { debut: 'asc' }],
      }),
    );
  }

  async create(user: AuthUser, dto: CreatePlanningDto) {
    const debut = combineDateTime(dto.jour, dto.debut);
    const fin = combineDateTime(dto.jour, dto.fin);
    if (fin <= debut) throw new BadRequestException('La fin doit être après le début');
    if (fin.getTime() - debut.getTime() > 16 * 3600_000) {
      throw new BadRequestException('Shift > 16 h suspect — vérifier');
    }
    const planning = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const employe = await tx.employe.findFirst({
        where: { id: dto.employeId, etablissementId: user.etablissementId },
      });
      if (!employe) throw new NotFoundException('Employé introuvable');
      // Conflit : même employé, même jour, chevauchement horaire (hors annulés).
      const jour = new Date(dto.jour);
      const chevauche = await tx.planning.findFirst({
        where: {
          employeId: dto.employeId,
          jour,
          statut: { notIn: ['annule', 'conge'] },
          debut: { lt: fin },
          fin: { gt: debut },
        },
      });
      if (chevauche) {
        throw new ConflictException('Chevauchement avec un shift existant ce jour');
      }
      const created = await tx.planning.create({
        data: {
          tenantId: user.tenantId,
          employeId: dto.employeId,
          jour,
          debut,
          fin,
          poste: dto.poste,
          statut: dto.statut ?? 'planifie',
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          utilisateurId: user.userId,
          action: 'planning.creer',
          entiteType: 'planning',
          entiteId: created.id,
          apres: { employe_id: dto.employeId, jour: dto.jour, debut: dto.debut, fin: dto.fin },
        },
      });
      return created;
    });
    this.logger.log('planning.created', 'equipe.planning', { tenant_id: user.tenantId, planning_id: planning.id });
    return planning;
  }

  async update(user: AuthUser, id: string, dto: UpdatePlanningDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.planning.findFirst({
        where: { id, employe: { etablissementId: user.etablissementId } },
      });
      if (!existing) throw new NotFoundException('Shift introuvable');
      if (dto.statut === 'annule' && existing.statut === 'annule') {
        throw new BadRequestException('Shift déjà annulé');
      }
      const jour = dto.jour ? new Date(dto.jour) : existing.jour;
      const debut = dto.debut
        ? combineDateTime(jour.toISOString().slice(0, 10), dto.debut)
        : existing.debut;
      const fin = dto.fin
        ? combineDateTime(jour.toISOString().slice(0, 10), dto.fin)
        : existing.fin;
      if (fin <= debut) throw new BadRequestException('La fin doit être après le début');
      // Re-vérifier le chevauchement si horaires ou jour modifiés.
      if (dto.jour || dto.debut || dto.fin) {
        const chevauche = await tx.planning.findFirst({
          where: {
            employeId: existing.employeId,
            id: { not: id },
            jour,
            statut: { notIn: ['annule', 'conge'] },
            debut: { lt: fin },
            fin: { gt: debut },
          },
        });
        if (chevauche) throw new ConflictException('Chevauchement avec un shift existant');
      }
      const updated = await tx.planning.update({
        where: { id },
        data: {
          ...(dto.jour !== undefined ? { jour } : {}),
          ...(dto.debut !== undefined ? { debut } : {}),
          ...(dto.fin !== undefined ? { fin } : {}),
          ...(dto.poste !== undefined ? { poste: dto.poste } : {}),
          ...(dto.statut !== undefined ? { statut: dto.statut } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          utilisateurId: user.userId,
          action: 'planning.modifier',
          entiteType: 'planning',
          entiteId: id,
          apres: { champs: Object.keys(dto) },
        },
      });
      return updated;
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.planning.findFirst({
        where: { id, employe: { etablissementId: user.etablissementId } },
      });
      if (!existing) throw new NotFoundException('Shift introuvable');
      await tx.planning.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          utilisateurId: user.userId,
          action: 'planning.supprimer',
          entiteType: 'planning',
          entiteId: id,
          apres: { employe_id: existing.employeId, jour: existing.jour.toISOString() },
        },
      });
    });
    return { ok: true };
  }
}
