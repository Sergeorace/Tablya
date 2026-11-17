import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitiatePaymentInput, InitiatePaymentResult, PaymentProvider, PayoutInput, WebhookEvent,
} from './payment-provider.interface';
import { MoyenPaiement } from './payment-provider.interface';

/**
 * Adaptateur FedaPay (docs/05 §5.6).
 *
 * ⚠️ À VÉRIFIER avec la documentation FedaPay officielle avant prod :
 *  - URL de base sandbox/prod et version d'API
 *  - `amount` : FedaPay attend le montant dans l'unité de la devise
 *    (XOF sans décimales) — on envoie donc montantCentimes / 100 ?
 *    Hypothèse : amount = entier XOF (ex. 5000), pas centimes.
 *  - Mécanisme exact de signature webhook (header + algorithme).
 * Les points incertains sont isolés dans ce fichier (pattern adapter).
 */
@Injectable()
export class FedapayProvider implements PaymentProvider {
  readonly name = 'fedapay' as const;
  readonly supportedMoyens: MoyenPaiement[] = ['tmoney', 'moov', 'flooz', 'carte'];
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly logger = new Logger('FedapayProvider');

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('FEDAPAY_BASE_URL', 'https://api.fedapay.com/v1');
    this.secretKey = config.get<string>('FEDAPAY_SECRET_KEY', '');
    this.webhookSecret = config.get<string>('FEDAPAY_WEBHOOK_SECRET', '');
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
        amount: Math.round(input.montantCentimes / 100), // XOF entier — à confirmer
        currency: { iso: input.devise },
        callback_url: input.successUrl,
        customer: {
          phone_number: input.clientPhone,
          email: input.clientEmail,
        },
        metadata: { transaction_id: input.transactionId, ...input.metadata },
      }),
    });
    const body = (await res.json()) as {
      v1_transaction?: { id?: number | string; reference?: string };
      message?: string;
    };
    if (!res.ok || !body.v1_transaction) {
      this.logger.error(`FedaPay initiate échoué: ${res.status}`);
      throw new Error(`FEDAPAY_INITIATE_FAILED:${res.status}`);
    }
    const tx = body.v1_transaction;
    return {
      referenceExterne: String(tx.reference ?? tx.id),
      instructions: undefined, // FedaPay retourne un lien de paiement ; USSD selon moyen
      raw: body,
    };
  }

  async parseWebhook(headers: Record<string, unknown>, rawBody: string): Promise<WebhookEvent | null> {
    // FedaPay : header X-FedaPay-Signature = HMAC-SHA256(rawBody, webhook_secret)
    const signature = headers['x-fedapay-signature'] as string | undefined;
    if (!signature || !this.webhookSecret) return null;
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const body = JSON.parse(rawBody) as {
      entity?: { reference?: string };
      status?: string;
      amount?: number;
    };
    const statut =
      body.status === 'approved' ? 'reussie'
      : body.status === 'declined' ? 'echouee'
      : body.status === 'cancelled' ? 'annulee'
      : 'expiree';
    return {
      referenceExterne: body.entity?.reference ?? '',
      statut,
      montantCentimes: body.amount != null ? Math.round(body.amount * 100) : undefined,
      payload: body,
    };
  }

  async refund(referenceExterne: string, montantCentimes?: number) {
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
    // FedaPay payouts/disbursements — endpoint à confirmer selon offre.
    const res = await fetch(`${this.baseUrl}/payouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(input.montantCentimes / 100),
        beneficiary: { phone_number: input.destination },
        description: `Reversement Tablya ${input.referenceExterne}`,
        metadata: input.metadata,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { reference?: string; id?: string };
    if (!res.ok) throw new Error(`FEDAPAY_PAYOUT_FAILED:${res.status}`);
    return { referenceExterne: String(body.reference ?? body.id ?? input.referenceExterne) };
  }
}
