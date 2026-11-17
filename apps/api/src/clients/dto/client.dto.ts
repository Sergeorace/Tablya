import { ArrayMinSize, IsArray, IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, Min, Length, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

export class DemanderOtpDto {
  @IsString() @Length(8, 20) telephone!: string;
}

export class VerifierOtpDto {
  @IsString() @Length(8, 20) telephone!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() languePreferee?: string;
}

export class CreerAvisDto {
  @IsUUID() commandeId!: string;
  @IsInt() @Min(1) @Max(5) note!: number;
  @IsOptional() @IsString() commentaire?: string;
}

export class RepondreAvisDto {
  @IsString() reponseGerant!: string;
}

export class LigneCommandeClientDto {
  @IsUUID() produitId!: string;
  @IsOptional() @IsUUID() varianteId?: string;
  @IsInt() @Min(1) quantite!: number;
}

export class CreerCommandeClientDto {
  /** Slug de l'établissement (résolution QR). */
  @IsString() slug!: string;
  /** ID de la place scannée (optionnel — emporter possible). */
  @IsOptional() @IsUUID() placeId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LigneCommandeClientDto)
  lignes!: LigneCommandeClientDto[];
  @IsUUID() idempotencyKey!: string;
}
