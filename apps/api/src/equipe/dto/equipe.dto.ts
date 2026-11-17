import {
  IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength,
} from 'class-validator';

export class CreateEmployeDto {
  @IsString() @MinLength(1) @MaxLength(100)
  nom!: string;

  @IsString() @MinLength(1) @MaxLength(100)
  prenom!: string;

  @IsString() @MinLength(1) @MaxLength(100)
  poste!: string;

  @IsOptional() @IsString() @MaxLength(20)
  telephone?: string;

  @IsOptional() @IsString() @MaxLength(50)
  coordonneePaiement?: string;

  @IsOptional() @IsNumber()
  salaireBaseCentimes?: number;

  @IsOptional() @IsString() @MaxLength(50)
  statutContrat?: string;

  @IsOptional() @IsDateString()
  dateEmbauche?: string;

  /** PIN de pointage 4-6 chiffres (stocké en HMAC, jamais en clair). */
  @IsOptional() @Matches(/^\d{4,6}$/)
  pin?: string;

  /** Compte utilisateur existant à lier (optionnel — invitation E6). */
  @IsOptional() @IsUUID()
  utilisateurId?: string;
}

export class UpdateEmployeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) nom?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) prenom?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) poste?: string;
  @IsOptional() @IsString() @MaxLength(20) telephone?: string;
  @IsOptional() @IsString() @MaxLength(50) coordonneePaiement?: string;
  @IsOptional() @IsNumber() salaireBaseCentimes?: number;
  @IsOptional() @IsString() @MaxLength(50) statutContrat?: string;
  @IsOptional() @IsDateString() dateEmbauche?: string;
  @IsOptional() @Matches(/^\d{4,6}$/) pin?: string;
  /** Motif obligatoire pour les champs sensibles (salaire, coordonnées). */
  @IsOptional() @IsString() @MaxLength(200) motif?: string;
}

export class InviterEmployeDto {
  @IsUUID() roleId!: string;
}

export class CreatePlanningDto {
  @IsUUID() employeId!: string;
  @IsDateString() jour!: string;
  /** Heure début au format HH:mm (ex. "08:30"). */
  @Matches(/^\d{2}:\d{2}$/) debut!: string;
  @Matches(/^\d{2}:\d{2}$/) fin!: string;
  @IsOptional() @IsString() @MaxLength(100) poste?: string;
  @IsOptional() @IsString() @MaxLength(50) statut?: string;
}

export class UpdatePlanningDto {
  @IsOptional() @IsDateString() jour?: string;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) debut?: string;
  @IsOptional() @Matches(/^\d{2}:\d{2}$/) fin?: string;
  @IsOptional() @IsString() @MaxLength(100) poste?: string;
  @IsOptional() @IsIn(['planifie', 'confirme', 'annule', 'conge'])
  statut?: string;
}

export class PointageDto {
  @IsIn(['pin', 'qr', 'gps', 'manuel'])
  methode!: string;

  /** PIN 4-6 chiffres — requis si methode=pin. */
  @IsOptional() @Matches(/^\d{4,6}$/) pin?: string;

  /** ID employé (badge QR = employe.id ; GPS/manuel). */
  @IsOptional() @IsUUID() employeId?: string;

  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;

  /** 'arrivee' (défaut) ou 'depart'. */
  @IsOptional() @IsIn(['arrivee', 'depart']) sens?: string;
}

export class CorrigerPointageDto {
  @IsOptional() @IsDateString() heureArrivee?: string;
  @IsOptional() @IsDateString() heureDepart?: string;
  @IsOptional() @IsIn(['present', 'absent', 'retard']) statut?: string;
  @IsString() @MinLength(3) @MaxLength(200)
  motif!: string;
}

export class ListEmployesQuery {
  @IsOptional() @IsString() @MaxLength(100) recherche?: string;
}

export class ListPlanningQuery {
  @IsDateString() debut!: string;
  @IsDateString() fin!: string;
  @IsOptional() @IsUUID() employeId?: string;
}

export class ListPointagesQuery {
  @IsDateString() date!: string;
  @IsOptional() @IsUUID() employeId?: string;
}
