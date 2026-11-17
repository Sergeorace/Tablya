import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { SalleService } from './salle.service';
import { CreatePlaceDto, CreateZoneDto, UpdatePlaceDto, UpdateZoneDto } from './dto/salle.dto';
import { JwtAuthGuard, PermissionsGuard, Public } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

/** Back-office établissement : plan de salle, zones, places (module C). */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalleController {
  constructor(private readonly salle: SalleService) {}

  // ---- Zones ----
  @Get('zones')
  @RequirePermissions('salle.gerer')
  listZones(@CurrentUser() user: AuthUser) {
    return this.salle.listZones(user);
  }

  @Post('zones')
  @RequirePermissions('salle.gerer')
  createZone(@CurrentUser() user: AuthUser, @Body() dto: CreateZoneDto) {
    return this.salle.createZone(user, dto);
  }

  @Patch('zones/:id')
  @RequirePermissions('salle.gerer')
  updateZone(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.salle.updateZone(user, id, dto);
  }

  @Delete('zones/:id')
  @RequirePermissions('salle.gerer')
  deleteZone(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salle.deleteZone(user, id);
  }

  // ---- Places ----
  @Get('places')
  @RequirePermissions('salle.gerer')
  listPlaces(@CurrentUser() user: AuthUser, @Query('zoneId') zoneId?: string) {
    return this.salle.listPlaces(user, zoneId);
  }

  @Get('salle/plan')
  @RequirePermissions('salle.gerer')
  planSalle(@CurrentUser() user: AuthUser) {
    return this.salle.planSalle(user);
  }

  @Post('places')
  @RequirePermissions('salle.gerer')
  createPlace(@CurrentUser() user: AuthUser, @Body() dto: CreatePlaceDto) {
    return this.salle.createPlace(user, dto);
  }

  @Patch('places/:id')
  @RequirePermissions('salle.gerer')
  updatePlace(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePlaceDto) {
    return this.salle.updatePlace(user, id, dto);
  }

  @Delete('places/:id')
  @RequirePermissions('salle.gerer')
  deletePlace(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salle.deletePlace(user, id);
  }

  @Post('places/:id/qr/rotate')
  @RequirePermissions('salle.gerer')
  rotateQr(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salle.rotateQrToken(user, id);
  }

  /** QR SVG d'une place (impression unitaire). */
  @Get('places/:id/qr.svg')
  @RequirePermissions('salle.gerer')
  async qrSvg(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { svg } = await this.salle.qrSvg(user, id);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    return res.send(svg);
  }

  /** Page HTML d'impression de tous les QR tables. */
  @Get('salle/qr-print')
  @RequirePermissions('salle.gerer')
  async qrPrint(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const html = await this.salle.qrPrintPage(user);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
}

/** Endpoints publics client : résolution QR place (B6). */
@Controller('public')
export class PublicSalleController {
  constructor(private readonly salle: SalleService) {}

  @Public()
  @Get('etablissements/:slug/places/:qrToken')
  resolveQr(@Param('slug') slug: string, @Param('qrToken') qrToken: string) {
    return this.salle.resolveQrToken(slug, qrToken);
  }
}
