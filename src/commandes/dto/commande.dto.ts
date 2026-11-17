import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsObject,
  IsOptional, IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { CommandeStatut, CommandeType, LigneStatut, PosteCible } from '@prisma/client';

export class LigneCommandeDto {
  @IsUUID() produitId!: string;
  @IsOptional() @IsUUID() varianteId?: string;
  @Type(() => Number) @IsInt() @Min(1) quantite!: number;
  @IsOptional() @IsObject() supplements?: Record<string, unknown>;
  @IsOptional() @IsEnum(PosteCible) posteCible?: PosteCible;
}

export class CreateCommandeDto {
  @IsOptional() @IsUUID() placeId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsEnum(CommandeType) type?: CommandeType;
  @IsOptional() @IsString() modePaiementPrevu?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LigneCommandeDto)
  lignes!: LigneCommandeDto[];
  @IsUUID() idempotencyKey!: string; // anti double-clic / retry réseau / sync hors ligne
  @IsOptional() @IsObject() metadataHorsLigne?: Record<string, unknown>;
}

export class AddLignesDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LigneCommandeDto)
  lignes!: LigneCommandeDto[];
}

export class UpdateCommandeStatutDto {
  @IsEnum(CommandeStatut) statut!: CommandeStatut;
}

export class UpdateLigneStatutDto {
  @IsEnum(LigneStatut) statut!: LigneStatut;
}

export class AnnulerCommandeDto {
  @IsString() @IsNotEmpty() motif!: string; // obligatoire (audit)
}

export class EncaisserEspecesDto {
  @IsOptional() @IsString() caissierNote?: string;
}

export class CloturerCaisseDto {
  @IsString() @IsNotEmpty() dateJour!: string; // YYYY-MM-DD
}
