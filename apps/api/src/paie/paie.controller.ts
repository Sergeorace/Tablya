import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PaieService } from './paie.service';
import {
  GenererBulletinsDto, ListerBulletinsQuery, ListerPaiementsQuery,
  MajBulletinDto, PayerBulletinDto, ParametresPaieDto,
} from './dto/paie.dto';

@Controller('paie')
export class PaieController {
  constructor(private readonly paie: PaieService) {}

  // ---------- Paramètres ----------

  @Get('parametres')
  @RequirePermissions('paie.preparer')
  getParametres(@CurrentUser() user: AuthUser) {
    return this.paie.getParametres(user);
  }

  @Put('parametres')
  @RequirePermissions('paie.preparer')
  setParametres(@CurrentUser() user: AuthUser, @Body() dto: ParametresPaieDto) {
    return this.paie.setParametres(user, dto);
  }

  // ---------- Bulletins ----------

  @Post('bulletins/generer')
  @RequirePermissions('paie.preparer')
  generer(@CurrentUser() user: AuthUser, @Body() dto: GenererBulletinsDto) {
    return this.paie.generer(user, dto);
  }

  @Get('bulletins')
  @RequirePermissions('paie.preparer', 'paie.approuver')
  lister(@CurrentUser() user: AuthUser, @Query() q: ListerBulletinsQuery) {
    return this.paie.lister(user, q);
  }

  @Get('bulletins/:id')
  @RequirePermissions('paie.preparer', 'paie.approuver')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.paie.get(user, id);
  }

  @Patch('bulletins/:id')
  @RequirePermissions('paie.preparer')
  maj(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MajBulletinDto,
  ) {
    return this.paie.maj(user, id, dto);
  }

  // ---------- Workflow 2 niveaux ----------

  @Post('bulletins/:id/valider')
  @RequirePermissions('paie.preparer')
  valider(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.paie.valider(user, id);
  }

  @Post('bulletins/:id/approuver')
  @RequirePermissions('paie.approuver')
  approuver(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.paie.approuver(user, id);
  }

  @Post('bulletins/:id/annuler')
  @RequirePermissions('paie.preparer', 'paie.approuver')
  annuler(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motif') motif: string,
  ) {
    return this.paie.annuler(user, id, motif);
  }

  // ---------- Paiements ----------

  @Post('bulletins/:id/payer')
  @RequirePermissions('paie.approuver')
  payer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayerBulletinDto,
  ) {
    return this.paie.payer(user, id, dto);
  }

  @Get('paiements')
  @RequirePermissions('paie.preparer', 'paie.approuver')
  listerPaiements(@CurrentUser() user: AuthUser, @Query() q: ListerPaiementsQuery) {
    return this.paie.listerPaiements(user, q);
  }

  @Post('paiements/:id/confirmer')
  @RequirePermissions('paie.approuver')
  confirmer(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.paie.confirmerPaiement(user, id);
  }

  @Post('paiements/:id/echouer')
  @RequirePermissions('paie.approuver')
  echouer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motif') motif: string,
  ) {
    return this.paie.echouerPaiement(user, id, motif);
  }
}
