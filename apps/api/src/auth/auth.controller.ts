import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterEtablissementDto } from './dto/register-etablissement.dto';
import { JwtAuthGuard, Public } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from './current-user.decorator';
import { IsNotEmpty, IsString } from 'class-validator';

class RefreshDto {
  @IsString() @IsNotEmpty() refreshToken!: string;
}

class LogoutDto {
  @IsString() @IsNotEmpty() refreshToken!: string;
}

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** A1 — Inscription d'un établissement (public, rate-limité plus tard). */
  @Public()
  @Post('etablissements')
  register(@Body() dto: RegisterEtablissementDto) {
    return this.auth.registerEtablissement(dto);
  }

  @Public()
  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('auth/refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('auth/logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto) {
    return this.auth.logout(user.userId, dto.refreshToken);
  }

  @Get('auth/me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
