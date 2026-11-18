import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, PermissionsGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { EtablissementService } from './etablissement.service';
import { MajEtablissementDto } from './etablissement.dto';

/** Fiche établissement du tenant (back-office paramètres). */
@Controller('etablissement')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EtablissementController {
  constructor(private readonly etablissement: EtablissementService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.etablissement.get(user);
  }

  @Patch()
  @RequirePermissions('etablissement.modifier')
  maj(@CurrentUser() user: AuthUser, @Body() dto: MajEtablissementDto) {
    return this.etablissement.maj(user, dto);
  }
}
