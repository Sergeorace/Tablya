import {
  Body, Controller, Get, Param, Patch, Post,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientAuthService } from './client-auth.service';
import {
  CreerAvisDto, CreerCommandeClientDto, DemanderOtpDto, RepondreAvisDto, VerifierOtpDto,
} from './dto/client.dto';
import { Public } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { IsString } from 'class-validator';

class SlugParam {
  @IsString() slug!: string;
}

/**
 * Routes clients : OTP publics + espace client authentifié (token 'client').
 * Les routes /clients/* n'ont pas de @RequirePermissions : le garde global
 * JWT suffit, l'identité client est vérifiée dans le service (clientId).
 */
@Controller()
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly clientAuth: ClientAuthService,
  ) {}

  // ---------------- Auth OTP (public) ----------------

  @Public()
  @Post('clients/auth/otp')
  demanderOtp(@Body() dto: DemanderOtpDto) {
    return this.clientAuth.demanderOtp(dto);
  }

  @Public()
  @Post('clients/auth/verify')
  verifierOtp(@Body() dto: VerifierOtpDto) {
    return this.clientAuth.verifierOtp(dto);
  }

  // ---------------- Espace client (token 'client') ----------------

  @Get('clients/me')
  me(@CurrentUser() user: AuthUser) {
    return this.clients.me(user);
  }

  @Get('clients/commandes')
  mesCommandes(@CurrentUser() user: AuthUser) {
    return this.clients.mesCommandes(user);
  }

  @Get('clients/commandes/:id')
  maCommande(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clients.maCommande(user, id);
  }

  @Get('clients/fidelite')
  fidelite(@CurrentUser() user: AuthUser) {
    return this.clients.maFidelite(user);
  }

  /** Commande client (scan QR → panier) — JWT 'client', tenant via slug. */
  @Post('clients/commandes')
  creerCommande(@CurrentUser() user: AuthUser, @Body() dto: CreerCommandeClientDto) {
    return this.clients.creerCommande(user, dto);
  }

  @Post('avis')
  creerAvis(@CurrentUser() user: AuthUser, @Body() dto: CreerAvisDto) {
    return this.clients.creerAvis(user, dto);
  }

  // ---------------- Avis (mixte) ----------------

  /** Avis publics d'un établissement — accessible sans compte. */
  @Public()
  @Get('etablissements/:slug/avis')
  avisPublics(@Param() params: SlugParam) {
    return this.clients.avisPublics(params.slug);
  }

  /** Avis de l'établissement pour le staff (réponse gérant). */
  @Get('avis')
  @RequirePermissions('avis.repondre')
  listerAvis(@CurrentUser() user: AuthUser) {
    return this.clients.listerAvis(user);
  }

  /** Réponse du gérant — staff avec permission avis.repondre. */
  @Patch('avis/:id/reponse')
  @RequirePermissions('avis.repondre')
  repondre(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RepondreAvisDto) {
    return this.clients.repondreAvis(user, id, dto.reponseGerant);
  }
}
