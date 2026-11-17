import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min,
  ValidateNested,
} from 'class-validator';
import { MoyenPaiement } from '../providers/payment-provider.interface';

export class InitierPaiementDto {
  @IsEnum(['tmoney', 'moov', 'flooz', 'carte', 'virement'] as const)
  moyen!: Exclude<MoyenPaiement, 'especes'>;

  @IsUUID()
  idempotencyKey!: string;

  @IsOptional() @IsString() clientPhone?: string;
  @IsOptional() @IsEmail() clientEmail?: string;
  @IsOptional() @IsInt() @Min(0) pourboireCentimes?: number;
  /** Montant explicite (parts de partage) — sinon total + pourboire. */
  @IsOptional() @IsInt() @Min(1) montantCentimes?: number;
}

export class PartageDto {
  @IsEnum(['tmoney', 'moov', 'flooz', 'carte', 'virement'] as const)
  moyen!: Exclude<MoyenPaiement, 'especes'>;

  @IsOptional() @IsInt() @Min(1) montantCentimes?: number;
  @IsOptional() @IsString() libelle?: string;
  @IsOptional() @IsString() clientPhone?: string;
  @IsOptional() @IsUUID() idempotencyKey?: string;
}

export class InitierPartagesDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => PartageDto)
  parts!: PartageDto[];
}

export class RemboursementDto {
  @IsOptional() @IsInt() @Min(1) montantCentimes?: number;
  @IsString() motif!: string;
}

export class ExecuterReversementDto {
  @IsString() destination!: string; // numéro mobile money / RIB
}
