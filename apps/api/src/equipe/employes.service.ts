import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHmac, randomBytes, randomInt } from 'crypto';
import { hash as argonHash } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JsonLogger } from '../common/json.logger';
import { CreateEmployeDto, InviterEmployeDto, UpdateEmployeDto } from './dto/equipe.dto';

/** Hachage déterministe du PIN de pointage (lookup par hash, jamais en clair). */
function hashPin(pin: string): string {
  const secret = process.env.POINTAGE_PIN_SECRET ?? process.env.JWT_ACCESS_SECRET ?? 'dev-secret';
  return createHmac('sha256', secret).update(`pointage:${pin}`).digest('hex');
}

@Injectable()
export class EmployesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
  ) {}

  private async audit(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    action: string,
    entiteType: string,
    entiteId: string,
    details?: Record<string, unknown>,
    motif?: string,
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        utilisateurId: user.userId,
        action,
        entiteType,
        entiteId,
        motif: motif ?? null,
        apres: (details ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async list(user: AuthUser, recherche?: string) {
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.employe.findMany({
        where: {
          etablissementId: user.etablissementId,
          ...(recherche
            ? {
                OR: [
                  { nom: { contains: recherche, mode: 'insensitive' } },
                  { prenom: { contains: recherche, mode: 'insensitive' } },
                  { poste: { contains: recherche, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: {
          id: true, nom: true, prenom: true, poste: true, telephone: true,
          statutContrat: true, dateEmbauche: true, salaireBaseCentimes: true,
          utilisateurId: true, createdAt: true,
        },
        orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      }),
    );
  }

  async get(user: AuthUser, id: string) {
    const e = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.employe.findFirst({
        where: { id, etablissementId: user.etablissementId },
      }),
    );
    if (!e) throw new NotFoundException('Employé introuvable');
    // Jamais le hash PIN dans la réponse.
    const { pointagePinHash: _h, ...safe } = e;
    return safe;
  }

  async create(user: AuthUser, dto: CreateEmployeDto) {
    if (dto.utilisateurId) {
      const u = await this.prisma.withTenant(user.tenantId, (tx) =>
        tx.utilisateur.findFirst({ where: { id: dto.utilisateurId!, tenantId: user.tenantId } }),
      );
      if (!u) throw new BadRequestException('Utilisateur introuvable pour ce tenant');
    }
    const employe = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const created = await tx.employe.create({
        data: {
          tenantId: user.tenantId,
          etablissementId: user.etablissementId,
          utilisateurId: dto.utilisateurId ?? null,
          nom: dto.nom,
          prenom: dto.prenom,
          poste: dto.poste,
          telephone: dto.telephone,
          coordonneePaiement: dto.coordonneePaiement,
          salaireBaseCentimes: dto.salaireBaseCentimes != null ? BigInt(dto.salaireBaseCentimes) : null,
          statutContrat: dto.statutContrat,
          dateEmbauche: dto.dateEmbauche ? new Date(dto.dateEmbauche) : null,
          pointagePinHash: dto.pin ? hashPin(dto.pin) : null,
        },
      });
      await this.audit(tx, user, 'employe.creer', 'employe', created.id, {
        poste: dto.poste,
        pin_defini: !!dto.pin,
      });
      return created;
    });
    this.logger.log('employe.created', 'equipe.employe', { tenant_id: user.tenantId, employe_id: employe.id });
    const { pointagePinHash: _h, ...safe } = employe;
    return safe;
  }

  async update(user: AuthUser, id: string, dto: UpdateEmployeDto) {
    const champsSensibles = ['salaireBaseCentimes', 'coordonneePaiement'];
    const sensiblesModifies = champsSensibles.filter((c) => dto[c as keyof UpdateEmployeDto] !== undefined);
    if (sensiblesModifies.length && !dto.motif) {
      throw new BadRequestException(
        `Motif requis pour modifier : ${sensiblesModifies.join(', ')}`,
      );
    }
    const employe = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.employe.findFirst({
        where: { id, etablissementId: user.etablissementId },
      });
      if (!existing) throw new NotFoundException('Employé introuvable');
      const updated = await tx.employe.update({
        where: { id },
        data: {
          ...(dto.nom !== undefined ? { nom: dto.nom } : {}),
          ...(dto.prenom !== undefined ? { prenom: dto.prenom } : {}),
          ...(dto.poste !== undefined ? { poste: dto.poste } : {}),
          ...(dto.telephone !== undefined ? { telephone: dto.telephone } : {}),
          ...(dto.coordonneePaiement !== undefined ? { coordonneePaiement: dto.coordonneePaiement } : {}),
          ...(dto.salaireBaseCentimes !== undefined
            ? { salaireBaseCentimes: BigInt(dto.salaireBaseCentimes) } : {}),
          ...(dto.statutContrat !== undefined ? { statutContrat: dto.statutContrat } : {}),
          ...(dto.dateEmbauche !== undefined
            ? { dateEmbauche: dto.dateEmbauche ? new Date(dto.dateEmbauche) : null } : {}),
          ...(dto.pin !== undefined ? { pointagePinHash: hashPin(dto.pin) } : {}),
        },
      });
      await this.audit(tx, user, 'employe.modifier', 'employe', id, {
          champs: Object.keys(dto).filter((k) => k !== 'motif'),
          sensibles: sensiblesModifies,
        }, dto.motif);
      return updated;
    });
    const { pointagePinHash: _h, ...safe } = employe;
    return safe;
  }

  /** Invitation : crée un compte Utilisateur (mot de passe temporaire) lié à l'employé. */
  async inviter(user: AuthUser, id: string, dto: InviterEmployeDto) {
    const employe = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.employe.findFirst({ where: { id, etablissementId: user.etablissementId } }),
    );
    if (!employe) throw new NotFoundException('Employé introuvable');
    if (employe.utilisateurId) {
      throw new BadRequestException('Cet employé a déjà un compte lié');
    }
    const role = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.role.findFirst({ where: { id: dto.roleId, tenantId: user.tenantId } }),
    );
    if (!role) throw new BadRequestException('Rôle introuvable pour ce tenant');
    // Mot de passe temporaire : 4 lettres + 4 chiffres, à changer à la 1re connexion.
    const temporaire = `${randomBytes(4).toString('hex')}@${randomInt(1000, 9999)}`;
    const hash = await argonHash(temporaire);
    const resultat = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const u = await tx.utilisateur.create({
        data: {
          tenantId: user.tenantId,
          etablissementId: user.etablissementId,
          email: employe.telephone
            ? `${employe.telephone.replace(/\D/g, '')}@employe.tablya.local`
            : null,
          telephone: employe.telephone,
          motDePasseHash: hash,
          roleId: role.id,
        },
      });
      await tx.employe.update({ where: { id }, data: { utilisateurId: u.id } });
      await this.audit(tx, user, 'employe.inviter', 'employe', id, {
        utilisateur_id: u.id,
        role_id: role.id,
      });
      return { utilisateurId: u.id, role: role.code };
    });
    this.logger.log('employe.invited', 'equipe.employe', { tenant_id: user.tenantId, employe_id: id });
    return {
      ...resultat,
      // À transmettre une seule fois à l'employé (canal sécurisé) — jamais stocké ni loggé.
      motDePasseTemporaire: temporaire,
    };
  }

  /** Reset du PIN de pointage (par un manager habilité). */
  async resetPin(user: AuthUser, id: string, pin: string) {
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const e = await tx.employe.findFirst({
        where: { id, etablissementId: user.etablissementId },
      });
      if (!e) throw new NotFoundException('Employé introuvable');
      await tx.employe.update({ where: { id }, data: { pointagePinHash: hashPin(pin) } });
      await this.audit(tx, user, 'employe.pin_reset', 'employe', id);
    });
    return { ok: true };
  }
}
