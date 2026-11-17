import { IsEmail, IsInt, IsOptional, IsString, IsUUID, Max, Min, Length, Matches } from 'class-validator';

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
