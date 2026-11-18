import { IsArray, IsObject, IsOptional, IsString, IsUrl } from 'class-validator';

/** Mise à jour de la fiche établissement du tenant connecté. */
export class MajEtablissementDto {
  @IsOptional() @IsString() raisonSociale?: string;
  @IsOptional() @IsString() rccm?: string;
  @IsOptional() @IsString() nif?: string;
  @IsOptional() @IsUrl({ require_tld: false }) logoUrl?: string;
  @IsOptional() @IsArray() langues?: string[];
  /** Créneaux d'ouverture — objet JSON libre ({"lun":"12:00-23:00",…}). */
  @IsOptional() @IsObject() horaires?: Record<string, unknown>;
  /** Charte graphique (couleurs, polices) — JSON libre. */
  @IsOptional() @IsObject() charteGraphique?: Record<string, unknown>;
}
