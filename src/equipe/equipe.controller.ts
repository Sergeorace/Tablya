import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { EmployesService } from './employes.service';
import { PlanningService } from './planning.service';
import { PointageService } from './pointage.service';
import {
  CorrigerPointageDto, CreateEmployeDto, CreatePlanningDto, InviterEmployeDto,
  ListEmployesQuery, ListPlanningQuery, ListPointagesQuery, PointageDto,
  UpdateEmployeDto, UpdatePlanningDto,
} from './dto/equipe.dto';

@Controller()
export class EquipeController {
  constructor(
    private readonly employes: EmployesService,
    private readonly planning: PlanningService,
    private readonly pointage: PointageService,
  ) {}

  // ---------- Employés ----------

  @Get('employes')
  @RequirePermissions('employe.gerer')
  listEmployes(@CurrentUser() user: AuthUser, @Query() q: ListEmployesQuery) {
    return this.employes.list(user, q.recherche);
  }

  @Get('employes/:id')
  @RequirePermissions('employe.gerer')
  getEmploye(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.employes.get(user, id);
  }

  @Post('employes')
  @RequirePermissions('employe.gerer')
  createEmploye(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeDto) {
    return this.employes.create(user, dto);
  }

  @Patch('employes/:id')
  @RequirePermissions('employe.gerer')
  updateEmploye(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeDto,
  ) {
    return this.employes.update(user, id, dto);
  }

  @Post('employes/:id/inviter')
  @RequirePermissions('employe.gerer')
  inviter(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviterEmployeDto,
  ) {
    return this.employes.inviter(user, id, dto);
  }

  @Post('employes/:id/pin')
  @RequirePermissions('employe.gerer')
  resetPin(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('pin') pin: string,
  ) {
    return this.employes.resetPin(user, id, pin);
  }

  // ---------- Planning ----------

  @Get('plannings')
  @RequirePermissions('planning.gerer')
  listPlanning(@CurrentUser() user: AuthUser, @Query() q: ListPlanningQuery) {
    return this.planning.list(user, q);
  }

  @Post('plannings')
  @RequirePermissions('planning.gerer')
  createPlanning(@CurrentUser() user: AuthUser, @Body() dto: CreatePlanningDto) {
    return this.planning.create(user, dto);
  }

  @Patch('plannings/:id')
  @RequirePermissions('planning.gerer')
  updatePlanning(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanningDto,
  ) {
    return this.planning.update(user, id, dto);
  }

  @Delete('plannings/:id')
  @RequirePermissions('planning.gerer')
  removePlanning(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.planning.remove(user, id);
  }

  // ---------- Pointage ----------

  /** Pointage self-service (PIN/QR/GPS) — public, la méthode fait foi. */
  @Public()
  @Post('pointage')
  pointer(@Body() dto: PointageDto, @Req() req: Request) {
    return this.pointage.pointer(dto, req.ip);
  }

  /** Pointage manuel par staff habilité (kiosque / assistance). */
  @Post('pointage/manuel')
  @RequirePermissions('pointage.effectuer')
  pointerManuel(@CurrentUser() user: AuthUser, @Body() dto: PointageDto) {
    return this.pointage.pointerManuel(user, dto);
  }

  @Get('pointages')
  @RequirePermissions('employe.gerer')
  listPointages(@CurrentUser() user: AuthUser, @Query() q: ListPointagesQuery) {
    return this.pointage.list(user, q);
  }

  @Patch('pointages/:id')
  @RequirePermissions('employe.gerer')
  corrigerPointage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrigerPointageDto,
  ) {
    return this.pointage.corriger(user, id, dto);
  }
}
