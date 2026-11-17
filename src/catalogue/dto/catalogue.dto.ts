import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber,
  IsObject, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

export class CreateCategorieDto {
  @IsString() @IsNotEmpty() nom!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) ordre?: number;
}

export class UpdateCategorieDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) ordre?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class VarianteDto {
  @IsOptional() id?: string;
  @IsString() @IsNotEmpty() nom!: string; // ex: "Standard", "Grand"
  @Type(() => Number) @IsInt() @Min(0) prixCentimes!: number;
  @IsOptional() @IsBoolean() actif?: boolean;
}

export class PrixPlageDto {
  @IsString() @IsNotEmpty() label!: string; // ex: "happy_hour"
  @IsString() @IsNotEmpty() debut!: string; // "17:00"
  @IsString() @IsNotEmpty() fin!: string;   // "19:00"
  @Type(() => Number) @IsInt() @Min(0) prixCentimes!: number;
  @IsOptional() @IsArray() @IsString({ each: true }) jours?: string[]; // lun..dim
}

export class CreateProduitDto {
  @IsString() @IsNotEmpty() nom!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() categorieId?: string;
  @IsOptional() @IsObject() allergenes?: Record<string, unknown>;
  @IsOptional() @IsBoolean() disponible?: boolean;
  @IsOptional() @IsBoolean() menuCompose?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrixPlageDto)
  prixParPlage?: PrixPlageDto[];
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => VarianteDto)
  variantes?: VarianteDto[];
  // Prix de base quand pas de variantes : centimes
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) prixCentimes?: number;
}

export class UpdateProduitDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() categorieId?: string;
  @IsOptional() @IsObject() allergenes?: Record<string, unknown>;
  @IsOptional() @IsBoolean() disponible?: boolean;
  @IsOptional() @IsBoolean() menuCompose?: boolean;
  @IsOptional() @IsBoolean() actif?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrixPlageDto)
  prixParPlage?: PrixPlageDto[];
  // Variantes à synchroniser (id présent = update, absent = create,
  // existantes non listées = désactivation logique).
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => VarianteDto)
  variantes?: VarianteDto[];
  // Prix simple : appliqué à la variante « Standard » (produits sans formats).
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) prixCentimes?: number;
}
