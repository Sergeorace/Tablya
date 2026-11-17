import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { CommandeService } from './commande.service';
import {
  AddLignesDto, AnnulerCommandeDto, CreateCommandeDto, UpdateCommandeStatutDto,
  UpdateLigneStatutDto,
} from './dto/commande.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { CommandeStatut, PosteCible } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

class ListCommandesQuery {
  @IsOptional() @IsEnum(CommandeStatut) statut?: CommandeStatut;
  @IsOptional() placeId?: string;
}

class KdsQuery {
  @IsOptional() @IsEnum(PosteCible) poste?: PosteCible;
}

/** POS : commandes, lignes, transitions, annulation, encaissement (modules D3–D5). */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommandeController {
  constructor(private readonly commandes: CommandeService) {}

  @Post('commandes')
  @RequirePermissions('commande.creer')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommandeDto) {
    return this.commandes.createCommande(user, dto);
  }

  @Get('commandes')
  @RequirePermissions('commande.creer')
  list(@CurrentUser() user: AuthUser, @Query() q: ListCommandesQuery) {
    return this.commandes.listCommandes(user, q);
  }

  @Get('commandes/:id')
  @RequirePermissions('commande.creer')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commandes.getCommande(user, id);
  }

  @Post('commandes/:id/lignes')
  @RequirePermissions('commande.modifier')
  addLignes(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddLignesDto) {
    return this.commandes.addLignes(user, id, dto);
  }

  @Post('commandes/:id/envoyer-production')
  @RequirePermissions('commande.modifier')
  envoyer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commandes.envoyerEnProduction(user, id);
  }

  @Patch('commandes/:id/statut')
  @RequirePermissions('commande.modifier')
  updateStatut(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCommandeStatutDto) {
    return this.commandes.updateCommandeStatut(user, id, dto);
  }

  @Patch('lignes/:id/statut')
  @RequirePermissions('commande.modifier')
  updateLigneStatut(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLigneStatutDto) {
    return this.commandes.updateLigneStatut(user, id, dto);
  }

  /** KDS — file de production filtrable par poste (cuisine/bar/caisse). */
  @Get('kds')
  @RequirePermissions('commande.creer')
  kds(@CurrentUser() user: AuthUser, @Query() q: KdsQuery) {
    return this.commandes.kdsBoard(user, q.poste);
  }

  @Post('commandes/:id/annuler')
  @RequirePermissions('commande.annuler')
  annuler(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AnnulerCommandeDto) {
    return this.commandes.annulerCommande(user, id, dto);
  }

  @Post('commandes/:id/encaisser-especes')
  @RequirePermissions('caisse.encaisser')
  encaisser(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.commandes.encaisserEspeces(user, id);
  }
}
