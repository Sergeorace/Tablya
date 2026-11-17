import {
  IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength,
} from 'class-validator';

export class ParametresPaieDto {
  /** Cotisation salariale en points de base (ex. 5500 = 55 %). */
  @IsInt() @Min(0) @Max(10000)
  cotisationSalarialeBp!: number;

  @IsInt() @Min(0) @Max(10000)
  impotBp!: number;

  /** Majoration heures sup en points de base (défaut 5000 = +50 %). */
  @IsInt() @Min(0) @Max(10000)
  heuresSupBp!: number;

  /** Minutes mensuelles de référence pour le taux horaire (défaut 12480 = 26j×8h). */
  @IsOptional() @IsInt() @Min(1) @Max(100000)
  minutesMensuelles?: number;
}

export class GenererBulletinsDto {
  @IsInt() @Min(2000) @Max(2100)
  annee!: number;

  @IsInt() @Min(1) @Max(12)
  mois!: number;

  /** Sous-ensemble d'employés ; vide = tous les employés de l'établissement. */
  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  employeIds?: string[];
}

export class MajBulletinDto {
  @IsOptional() @IsInt() @Min(0)
  primesCentimes?: number;

  @IsOptional() @IsInt() @Min(0)
  retenuesCentimes?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  heuresSupMinutes?: number;

  @IsOptional() @IsString() @MaxLength(200)
  motif?: string;
}

export class PayerBulletinDto {
  /** Coordonnée de paiement (numéro mobile money) — sinon celle de l'employé. */
  @IsOptional() @IsString() @MaxLength(50)
  coordonneePaiement?: string;
}

export class ListerBulletinsQuery {
  @IsInt() @Min(2000) @Max(2100)
  annee!: number;

  @IsInt() @Min(1) @Max(12)
  mois!: number;

  @IsOptional() @IsIn(['brouillon', 'valide', 'approuve', 'paye', 'annule'])
  statut?: string;
}

export class ListerPaiementsQuery {
  @IsOptional() @IsIn(['planifie', 'en_cours', 'reussi', 'echoue', 'a_rejouer'])
  statut?: string;
}
