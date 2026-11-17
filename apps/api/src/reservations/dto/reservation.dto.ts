import { Type } from 'class-transformer';
import {
  IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min,
} from 'class-validator';
import { ReservationStatut } from '@prisma/client';

export class CreerReservationDto {
  @IsString() etablissementSlug!: string;
  @IsString() telephone!: string;
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsDateString() creneauDebut!: string;
  @IsInt() @Min(1) @Max(50) nbPersonnes!: number;
  @IsOptional() @IsUUID() placeId?: string;
}

export class UpdateReservationStatutDto {
  @IsEnum(['confirmee', 'annulee', 'no_show', 'honoree', 'en_attente'] as const)
  statut!: ReservationStatut;

  @IsOptional() @IsString() motif?: string;
}

export class ListeAttenteDto {
  @IsString() etablissementSlug!: string;
  @IsString() telephone!: string;
  @IsOptional() @IsString() nom?: string;
  @IsInt() @Min(1) @Max(50) nbPersonnes!: number;
  @IsOptional() @IsDateString() creneauSouhaite?: string;
}

export class DisponibilitesQuery {
  @IsString() date!: string; // YYYY-MM-DD
}
