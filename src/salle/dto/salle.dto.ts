import { Type } from 'class-transformer';
import { PlaceStatut, PlaceType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateZoneDto {
  @IsString() @IsNotEmpty() nom!: string; // salle | terrasse | vip | bar | etages...
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) capaciteDefaut?: number;
}

export class UpdateZoneDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) capaciteDefaut?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreatePlaceDto {
  @IsString() @IsNotEmpty() zoneId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) capacite?: number;
  @IsOptional() type?: PlaceType;
  @IsOptional() @IsString() numero?: string; // sinon généré ETAB-ZONE-NNN
}

export class UpdatePlaceDto {
  @IsOptional() @IsString() zoneId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) capacite?: number;
  @IsOptional() type?: PlaceType;
  @IsOptional() @IsEnum(PlaceStatut) statut?: PlaceStatut;
}
