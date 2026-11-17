import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PilotageService } from './pilotage.service';

@Controller('pilotage')
export class PilotageController {
  constructor(private readonly pilotage: PilotageService) {}

  @Get('dashboard')
  @RequirePermissions('rapport.exporter')
  dashboard(
    @CurrentUser() user: AuthUser,
    @Query('debut') debut?: string,
    @Query('fin') fin?: string,
  ) {
    return this.pilotage.dashboard(user, debut, fin);
  }

  @Get('rapports/commandes')
  @RequirePermissions('rapport.exporter')
  async exportCommandes(
    @CurrentUser() user: AuthUser,
    @Query('debut') debut: string,
    @Query('fin') fin: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const data = await this.pilotage.exportCommandes(user, debut, fin, format ?? 'json');
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=commandes.csv');
      return res.send(data);
    }
    return res.json(data);
  }

  @Get('rapports/transactions')
  @RequirePermissions('rapport.exporter')
  async exportTransactions(
    @CurrentUser() user: AuthUser,
    @Query('debut') debut: string,
    @Query('fin') fin: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const data = await this.pilotage.exportTransactions(user, debut, fin, format ?? 'json');
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
      return res.send(data);
    }
    return res.json(data);
  }
}
