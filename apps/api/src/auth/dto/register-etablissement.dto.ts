import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GerantDto {
  @IsString() @IsNotEmpty() nom!: string;
  @IsString() @IsNotEmpty() prenom!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(10) password!: string;
  @IsOptional() @IsString() telephone?: string;
}

export class RegisterEtablissementDto {
  @IsString() @IsNotEmpty() raisonSociale!: string;
  @IsOptional() @IsString() rccm?: string;
  @IsOptional() @IsString() nif?: string;
  @IsOptional() @IsString() adresse?: string;
  @IsString() @IsNotEmpty() ville!: string;
  @IsOptional() @IsString() pays?: string;
  @IsOptional() @IsString() devise?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) langues?: string[];
  @IsOptional() @IsObject() horaires?: Record<string, unknown>;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]+$/, { message: 'slug: minuscules, chiffres, tirets' })
  slug?: string;
  @IsOptional() plan?: 'starter' | 'pro' | 'entreprise';

  @ValidateNested()
  @Type(() => GerantDto)
  gerant!: GerantDto;
}
