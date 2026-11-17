import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitiatePaymentInput, InitiatePaymentResult, PaymentProvider, PayoutInput, WebhookEvent,
} from './payment-provider.interface';
import { MoyenPaiement } from './payment-provider.interface';

/**
 * Adaptateur CinetPay (docs/05 §5.6) — fallback / redondance FedaPay.
 *
 * ⚠️ À VÉRIFIER avec la documentation CinetPay officielle :
 *  - checkout URL (api-checkout.cinetpay.com/v2/payment)
 *  - notification serveur (notify_url) : paramètres et signature HMAC
 *  - endpoints refund / payout disponibles selon contrat.
 */
@Injectable()
export class CinetpayProvider implements PaymentProvider {
  readonly name = 'cinetpay' as const;
  readonly supportedMoyens: MoyenPaiement[] = ['tmoney', 'moov', 'carte', 'flooz'];
  private readonly apiKey: string;
  private readonly siteId: string;
  private readonly secretKey: string;
  private readonly checkoutUrl: string;
  private readonly logger = new Logger('CinetpayProvider');

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('CINETPAY_API_KEY', '');
    this.siteId = config.get<string>('CINETPAY_SITE_ID', '');
    this.secretKey = config.get<string>('CINETPAY_SECRET_KEY', '');
    this.checkoutUrl = config.get<string>('CINETPAY_CHECKOUT_URL', 'https://api-checkout.cinetpay.com/v2/payment');
  }

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const res = await fetch(this.checkoutUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: input.transactionId,
        amount: input.montantCentimes, // XOF — CinetPay attend le montant en XOF
        currency: input.devise,
        description: input.description,
        customer_phone_number: input.clientPhone,
        customer_email: input.clientEmail,
        notify_url: input.successUrl?.replace('/client', '/webhooks/cinetpay') ?? undefined,
        return_url: input.successUrl,
        channels: this.moyenToChannel(input.moyen),
        metadata: input.metadata,
      }),
    });
    const body = (await res.json()) as { code?: string; data?: { token?: string; payment_url?: string } };
    if (!res.ok || body.code !== '201' || !body.data?.token) {
      this.logger.error(`CinetPay initiate échoué: ${res.status}`);
      throw new Error(`CINETPAY_INITIATE_FAILED:${res.status}`);
    }
    return {
      referenceExterne: body.data.token,
      instructions: body.data.payment_url,
      raw: body,
    };
  }

  private moyenToChannel(moyen: MoyenPaiement): string {
    switch (moyen) {
      case 'tmoney': return 'TCHAD'; // TMoney opère aussi au Togo via Flooz/Moov selon config — à affiner
      case 'moov': return 'MOOV';
      case 'flooz': return 'FLOOZ';
      case 'carte': return 'CB';
      default: return 'ALL';
    }
  }

  async parseWebhook(headers: Record<string, unknown>, rawBody: string): Promise<WebhookEvent | null> {
    // CinetPay notify_url : POST form-urlencoded avec cpm_trans_id,
    // cpm_amount, cpm_currency, signature = HMAC-SHA256(params, secret_key)
    const params = new URLSearchParams(rawBody);
    const signature = params.get('signature') ?? (headers['x-cinetpay-signature'] as string | undefined);
    if (!signature || !this.secretKey) return null;

    const expected = createHmac('sha256', this.secretKey)
      .update(`${params.get('cpm_trans_id')}${params.get('cpm_amount')}${params.get('cpm_currency')}`)
      .digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const code = params.get('cpm_result'); // 00 = succès selon doc CinetPay
    const statut =
      code === '00' ? 'reussie'
      : code === '6' ? 'annulee'
      : 'echouee';
    const montant = params.get('cpm_amount');
    return {
      referenceExterne: params.get('cpm_trans_id') ?? '',
      statut,
      montantCentimes: montant ? parseInt(montant, 10) : undefined,
      payload: Object.fromEntries(params.entries()),
    };
  }

  async refund(referenceExterne: string, montantCentimes?: number) {
    // Endpoint refund CinetPay : /v2/refund — paramètres à confirmer.
    const res = await fetch('https://api-checkout.cinetpay.com/v2/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: referenceExterne,
        amount: montantCentimes,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { code?: string; data?: { token?: string } };
    if (!res.ok) throw new Error(`CINETPAY_REFUND_FAILED:${res.status}`);
    return { referenceExterne: body.data?.token ?? referenceExterne };
  }

  async payout(input: PayoutInput): Promise<{ referenceExterne: string }> {
    throw new Error('CINETPAY_PAYOUT_NOT_SUPPORTED'); // à confirmer selon contrat
  }
}
