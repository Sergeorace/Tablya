import {
  Body, Controller, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ReservationStatut } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ReservationService } from './reservation.service';
import {
  CreerReservationDto, ListeAttenteDto, UpdateReservationStatutDto,
} from './dto/reservation.dto';
import { Public } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

class ListQuery {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsEnum(['en_attente', 'confirmee', 'annulee', 'no_show', 'honoree'] as const)
  statut?: ReservationStatut;
}

class ConsulterQuery {
  @IsString() telephone!: string;
}

/**
 * Réservations : endpoints publics (création, consultation par téléphone,
 * disponibilités, liste d'attente) + gestion staff (permission reservation.gerer).
 */
@Controller()
export class ReservationController {
  constructor(private readonly reservations: ReservationService) {}

  // ---------------- Public ----------------

  @Public()
  @Post('reservations')
  creer(@Body() dto: CreerReservationDto) {
    return this.reservations.creer(dto);
  }

  @Public()
  @Post('reservations/liste-attente')
  listeAttente(@Body() dto: ListeAttenteDto) {
    return this.reservations.rejoindreListeAttente(dto);
  }

  @Public()
  @Get('etablissements/:slug/disponibilites')
  disponibilites(@Param('slug') slug: string, @Query('date') date: string) {
    return this.reservations.disponibilites(slug, date);
  }

  @Public()
  @Get('etablissements/:slug/reservations/:id')
  consulter(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Query() q: ConsulterQuery,
  ) {
    return this.reservations.consulterPublic(slug, id, q.telephone);
  }

  // ---------------- Staff ----------------

  @Get('reservations')
  @RequirePermissions('reservation.gerer')
  list(@CurrentUser() user: AuthUser, @Query() q: ListQuery) {
    return this.reservations.list(user, q);
  }

  @Patch('reservations/:id/statut')
  @RequirePermissions('reservation.gerer')
  updateStatut(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReservationStatutDto,
  ) {
    return this.reservations.updateStatut(user, id, dto);
  }
}
