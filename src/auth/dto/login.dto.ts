import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  tenant!: string; // slug ou tenant_id de l'établissement

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
