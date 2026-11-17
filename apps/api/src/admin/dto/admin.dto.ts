import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class StatutEtablissementDto {
  @IsString() @MinLength(3) @MaxLength(300)
  motif!: string;
}

export class ListerEtablissementsQuery {
  @IsOptional() @IsIn(['en_attente', 'actif', 'suspendu', 'rejete'])
  statut?: string;

  @IsOptional() @IsString() @MaxLength(100)
  recherche?: string;
}

export class ListerTransactionsAdminQuery {
  @IsOptional() @IsIn([
    'initiee', 'en_attente', 'reussie', 'echouee', 'expiree', 'annulee',
    'partiellement_payee', 'remboursee_partiellement', 'remboursee',
  ])
  statut?: string;

  @IsOptional() @IsString() @MaxLength(50)
  fournisseur?: string;
}

export class MajAbonnementDto {
  @IsOptional() @IsIn(['starter', 'pro', 'entreprise'])
  plan?: string;

  @IsOptional() @IsIn(['essai', 'actif', 'impaye', 'suspendu', 'resilie'])
  statut?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100_000_000)
  montantCentimes?: number;

  @IsOptional() @IsString() @MaxLength(200)
  motif?: string;
}
