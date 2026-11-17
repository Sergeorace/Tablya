import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';
import { PlatformGuard } from './platform.guard';
import {
  ListerEtablissementsQuery, ListerTransactionsAdminQuery, MajAbonnementDto,
  StatutEtablissementDto,
} from './dto/admin.dto';

@Controller('admin')
@UseGuards(PlatformGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ---------- Établissements / KYC ----------

  @Get('etablissements')
  listerEtablissements(@Query() q: ListerEtablissementsQuery) {
    return this.admin.listerEtablissements(q);
  }

  @Post('etablissements/:id/valider')
  valider(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatutEtablissementDto,
  ) {
    return this.admin.transitionStatut(id, 'valider', dto.motif, user);
  }

  @Post('etablissements/:id/rejeter')
  rejeter(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatutEtablissementDto,
  ) {
    return this.admin.transitionStatut(id, 'rejeter', dto.motif, user);
  }

  @Post('etablissements/:id/suspendre')
  suspendre(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatutEtablissementDto,
  ) {
    return this.admin.transitionStatut(id, 'suspendre', dto.motif, user);
  }

  @Post('etablissements/:id/reactiver')
  reactiver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatutEtablissementDto,
  ) {
    return this.admin.transitionStatut(id, 'reactiver', dto.motif, user);
  }

  // ---------- Supervision transactions ----------

  @Get('transactions')
  listerTransactions(@Query() q: ListerTransactionsAdminQuery) {
    return this.admin.listerTransactions(q);
  }

  // ---------- Abonnements ----------

  @Get('abonnements')
  listerAbonnements() {
    return this.admin.listerAbonnements();
  }

  @Patch('abonnements/:id')
  majAbonnement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MajAbonnementDto,
  ) {
    return this.admin.majAbonnement(id, dto, user);
  }
}
