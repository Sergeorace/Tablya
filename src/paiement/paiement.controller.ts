import {
  Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { IsEnum, IsOptional } from 'class-validator';
import { TransactionStatut, FournisseurPaiement } from '@prisma/client';
import { PaiementService } from './paiement.service';
import {
  ExecuterReversementDto, InitierPartagesDto, InitierPaiementDto, RemboursementDto,
} from './dto/paiement.dto';
import { Public } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

class ListTransactionsQuery {
  @IsOptional() @IsEnum(TransactionStatut) statut?: TransactionStatut;
  @IsOptional() @IsEnum(['fedapay', 'cinetpay', 'stripe', 'especes', 'virement'] as const)
  fournisseur?: FournisseurPaiement;
}

/**
 * Paiement : initiation, webhooks publics, transactions, remboursements,
 * portefeuille et reversements (module E / docs/01 §1.16).
 */
@Controller()
export class PaiementController {
  constructor(private readonly paiement: PaiementService) {}

  // ---------------- Initier (protégé) ----------------

  @Post('commandes/:id/paiements')
  @RequirePermissions('paiement.initier')
  initier(
    @CurrentUser() user: AuthUser,
    @Param('id') commandeId: string,
    @Body() dto: InitierPaiementDto,
  ) {
    return this.paiement.initierPaiement(user, commandeId, dto);
  }

  /** Paiement initié par le client (JWT 'client') — mobile money USSD/carte. */
  @Post('clients/commandes/:id/paiements')
  initierClient(
    @CurrentUser() user: AuthUser,
    @Param('id') commandeId: string,
    @Body() dto: InitierPaiementDto,
  ) {
    return this.paiement.initierPaiementClient(user, commandeId, dto);
  }

  /** Paiement fractionné : N transactions, une par convive (US-4.3). */
  @Post('commandes/:id/partages')
  @RequirePermissions('paiement.initier')
  partages(
    @CurrentUser() user: AuthUser,
    @Param('id') commandeId: string,
    @Body() dto: InitierPartagesDto,
  ) {
    return this.paiement.initierPaiementsPartages(user, commandeId, dto.parts);
  }

  // ---------------- Webhooks (publics, signature vérifiée) ----------------

  /**
   * Webhook FedaPay / CinetPay — `@Public()` + vérification HMAC dans
   * le provider. Body brut requis pour la signature (rawBody: true dans main.ts).
   */
  @Public()
  @Post('webhooks/:fournisseur')
  @HttpCode(200)
  async webhook(
    @Param('fournisseur') fournisseur: string,
    @Headers() headers: Record<string, string>,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    const event = await this.paiement.handleWebhook(
      fournisseur as FournisseurPaiement,
      headers,
      rawBody,
    );
    // Toujours 200 pour ne pas déclencher de retry inutile du fournisseur ;
    // le rejet est tracé dans payment_event / logs.
    return { accepted: !!event };
  }

  // ---------------- Consultation ----------------

  @Get('transactions')
  @RequirePermissions('paiement.initier')
  list(@CurrentUser() user: AuthUser, @Query() q: ListTransactionsQuery) {
    return this.paiement.listTransactions(user, q);
  }

  @Get('portefeuille')
  @RequirePermissions('paiement.initier')
  portefeuille(@CurrentUser() user: AuthUser) {
    return this.paiement.getPortefeuille(user);
  }

  // ---------------- Remboursement ----------------

  @Post('transactions/:id/remboursements')
  @RequirePermissions('paiement.rembourser')
  rembourser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RemboursementDto,
  ) {
    return this.paiement.initierRemboursement(user, id, dto);
  }

  // ---------------- Reversements ----------------

  @Get('reversements')
  @RequirePermissions('portefeuille.retirer')
  listReversements(@CurrentUser() user: AuthUser) {
    return this.paiement.listReversements(user);
  }

  @Post('reversements/:id/executer')
  @RequirePermissions('portefeuille.retirer')
  executerReversement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ExecuterReversementDto,
  ) {
    return this.paiement.executerReversement(user, id, dto.destination);
  }
}
