import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { MajEtablissementDto } from './etablissement.dto';
import { getRequestContext } from '../common/als';

/** Fiche établissement du tenant connecté (paramètres back-office). */
@Injectable()
export class EtablissementService {
  constructor(private readonly prisma: PrismaService) {}

  get(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const etab = await tx.etablissement.findUnique({
        where: { id: user.etablissementId },
        include: {
          abonnements: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { places: true, produits: true, employes: true } },
        },
      });
      if (!etab) throw new NotFoundException('Établissement introuvable');
      return etab;
    });
  }

  async maj(user: AuthUser, dto: MajEtablissementDto) {
    const data: Prisma.EtablissementUpdateInput = {
      ...(dto.raisonSociale !== undefined ? { raisonSociale: dto.raisonSociale } : {}),
      ...(dto.rccm !== undefined ? { rccm: dto.rccm } : {}),
      ...(dto.nif !== undefined ? { nif: dto.nif } : {}),
      ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
      ...(dto.langues !== undefined ? { langues: dto.langues } : {}),
      ...(dto.horaires !== undefined ? { horaires: dto.horaires as Prisma.InputJsonValue } : {}),
      ...(dto.charteGraphique !== undefined
        ? { charteGraphique: dto.charteGraphique as Prisma.InputJsonValue }
        : {}),
    };
    if (Object.keys(data).length === 0) return this.get(user);

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const avant = await tx.etablissement.findUnique({ where: { id: user.etablissementId } });
      if (!avant) throw new NotFoundException('Établissement introuvable');
      const maj = await tx.etablissement.update({
        where: { id: user.etablissementId },
        data,
      });
      const ctx = getRequestContext();
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          utilisateurId: user.userId,
          etablissementId: user.etablissementId,
          action: 'etablissement.modifier',
          entiteType: 'etablissement',
          entiteId: user.etablissementId,
          avant: {
            raisonSociale: avant.raisonSociale, rccm: avant.rccm, nif: avant.nif,
            horaires: avant.horaires, logoUrl: avant.logoUrl,
          } as never,
          apres: data as never,
          requestId: ctx?.requestId,
        },
      });
      return maj;
    });
  }
}
