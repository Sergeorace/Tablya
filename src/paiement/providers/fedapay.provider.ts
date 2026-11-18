import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitiatePaymentInput, InitiatePaymentResult, PaymentProvider, PayoutInput, WebhookEvent,
} from './payment-provider.interface';
import { MoyenPaiement } from './payment-provider.interface';

/**
 * Adaptateur FedaPay — contrat vérifié sur docs.fedapay.com et le SDK
 * officiel `fedapay@1.2.5` (dist/Webhook.js).
 *
 * - Initiation : POST /v1/transactions — `amount` en unité de devise
 *   (XOF entier, sans décimales), `custom_metadata` pour nos références.
 * - Webhook : header `X-FEDAPAY-SIGNATURE` au format `t=<ts>,s=<hmac>` ;
 *   signature = HMAC-SHA256(`${t}.${rawBody}`, secret_endpoint `wh_...`),
 *   tolérance 300 s (DEFAULT_TOLERANCE du SDK officiel).
 * - Événements : `transaction.approved|declined|canceled|created|updated…`
 *   avec `entity` = objet transaction (reference, amount, status…).
 *
 * ⚠️ Reste à confirmer en sandbox : flux mobile money "send now"
 *    (Transaction.generateToken + sendNowWithToken) et endpoints
 *    refund/payout selon offre contractuelle.
 */
@Injectable()
export class FedapayProvider implements PaymentProvider {
  readonly name = 'fedapay' as const;
  readonly supportedMoyens: MoyenPaiement[] = ['tmoney', 'moov', 'flooz', 'carte'];
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly paymentLinkTemplate: string;
  private readonly logger = new Logger('FedapayProvider');

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('FEDAPAY_BASE_URL', 'https://api.fedapay.com/v1');
    this.secretKey = config.get<string>('FEDAPAY_SECRET_KEY', '');
    this.webhookSecret = config.get<string>('FEDAPAY_WEBHOOK_SECRET', '');
    // Lien de paiement FedaPay : https://app.fedapay.com/m/{token}
    // (sandbox : https://sandbox.fedapay.com/m/{token})
    this.paymentLinkTemplate = config.get<string>(
      'FEDAPAY_PAYMENT_LINK_TEMPLATE',
      'https://app.fedapay.com/m/{token}',
    );
  }

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const res = await fetch(`${this.baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: input.description,
        amount: Math.round(input.montantCentimes / 100), // XOF entier
        currency: { iso: input.devise },
        callback_url: input.successUrl,
        customer: {
          phone_number: input.clientPhone,
          email: input.clientEmail,
        },
        custom_metadata: { transaction_id: input.transactionId, ...input.metadata },
      }),
    });
    const body = (await res.json()) as {
      v1_transaction?: {
        id?: number | string;
        reference?: string;
        token?: string;
      };
      message?: string;
    };
    const tx = body.v1_transaction;
    if (!res.ok || !tx) {
      this.logger.error(`FedaPay initiate échoué: ${res.status}`);
      throw new Error(`FEDAPAY_INITIATE_FAILED:${res.status}`);
    }
    const instructions = tx.token
      ? this.paymentLinkTemplate.replace('{token}', String(tx.token))
      : undefined;
    return {
      referenceExterne: String(tx.reference ?? tx.id),
      instructions,
      raw: body,
    };
  }

  /**
   * Vérifie `X-FEDAPAY-SIGNATURE` = `t=<unix>,s=<hmac_sha256_hex(t.rawBody)>`
   * avec tolérance 300 s — même algorithme que WebhookSignature du SDK officiel.
   */
  async parseWebhook(headers: Record<string, unknown>, rawBody: string): Promise<WebhookEvent | null> {
    const header = headers['x-fedapay-signature'] as string | undefined;
    if (!header || !this.webhookSecret) return null;

    const tMatch = /(?:^|,)\s*t=(\d+)/.exec(header);
    const sMatch = /(?:^|,)\s*s=([a-f0-9]{64})/i.exec(header);
    if (!tMatch || !sMatch) return null;

    const timestamp = parseInt(tMatch[1], 10);
    const age = Math.floor(Date.now() / 1000) - timestamp;
    if (age > 300) return null; // tolérance officielle : 5 min

    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex');
    const a = Buffer.from(sMatch[1]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const body = JSON.parse(rawBody) as {
      name?: string; // 'transaction.approved' | 'transaction.declined' | …
      entity?: {
        reference?: string;
        id?: number | string;
        amount?: number;
        status?: string;
      };
    };
    const entity = body.entity;
    if (!entity?.reference) return null;

    const evenement = body.name ?? '';
    const statut =
      evenement === 'transaction.approved' || entity.status === 'approved' ? 'reussie'
      : evenement === 'transaction.declined' || entity.status === 'declined' ? 'echouee'
      : evenement === 'transaction.canceled' || entity.status === 'canceled' ? 'annulee'
      : 'ignoree'; // created/updated/transferred : non terminal, ignoré

    return {
      referenceExterne: String(entity.reference),
      statut,
      // amount FedaPay = unité de devise (XOF) → centimes
      montantCentimes: entity.amount != null ? Math.round(entity.amount * 100) : undefined,
      payload: body,
    };
  }

  async refund(referenceExterne: string, montantCentimes?: number) {
    // ⚠️ Endpoint exact à confirmer en sandbox : FedaPay expose le refund
    // via l'API transaction (pas de ressource Refund dédiée dans le SDK).
    const res = await fetch(`${this.baseUrl}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: { reference: referenceExterne },
        amount: montantCentimes != null ? Math.round(montantCentimes / 100) : undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { reference?: string; id?: string };
    if (!res.ok) throw new Error(`FEDAPAY_REFUND_FAILED:${res.status}`);
    return { referenceExterne: String(body.reference ?? body.id ?? referenceExterne) };
  }

  async payout(input: PayoutInput) {
    // Payout FedaPay : POST /v1/payouts (ressource Payout du SDK officiel).
    // Les champs exacts (mode, customer/balance) dépendent de l'offre —
    // ⚠️ à valider en sandbox avant la mise en prod des reversements.
    const res = await fetch(`${this.baseUrl}/payouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(input.montantCentimes / 100),
        description: `Reversement Tablya ${input.referenceExterne}`,
        beneficiary: { phone_number: input.destination },
        metadata: input.metadata,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { reference?: string; id?: string };
    if (!res.ok) throw new Error(`FEDAPAY_PAYOUT_FAILED:${res.status}`);
    return { referenceExterne: String(body.reference ?? body.id ?? input.referenceExterne) };
  }
}
