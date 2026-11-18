import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitiatePaymentInput, InitiatePaymentResult, PaymentProvider, PayoutInput, WebhookEvent,
} from './payment-provider.interface';
import { MoyenPaiement } from './payment-provider.interface';

/**
 * Adaptateur CinetPay — contrat vérifié sur docs.cinetpay.com
 * (checkout/initialisation, checkout/notification, checkout/hmac,
 * checkout/verification).
 *
 * - Initiation : POST /v2/payment — `amount` entier XOF **multiple de 5**,
 *   `channels` ∈ ALL|MOBILE_MONEY|CREDIT_CARD|WALLET (univers de paiement,
 *   pas opérateur), `notify_url` obligatoire (webhook serveur),
 *   `return_url` (retour client). Réponse : code '201' + data.token.
 * - Notification (IPN) : POST `application/x-www-form-urlencoded` sur
 *   notify_url ; header `x-token` = HMAC-SHA256 hex de la concaténation
 *   des valeurs POST (dans l'ordre reçu) avec `secret_key`.
 *   `cpm_result` = '00' → succès.
 * - Vérification serveur (recommandée) : POST /v2/payment/check
 *   {apikey, site_id, transaction_id} → data.status 'ACCEPTED'.
 */
@Injectable()
export class CinetpayProvider implements PaymentProvider {
  readonly name = 'cinetpay' as const;
  readonly supportedMoyens: MoyenPaiement[] = ['tmoney', 'moov', 'flooz', 'carte'];
  private readonly apiKey: string;
  private readonly siteId: string;
  private readonly secretKey: string;
  private readonly checkoutUrl: string;
  private readonly checkUrl: string;
  private readonly logger = new Logger('CinetpayProvider');

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('CINETPAY_API_KEY', '');
    this.siteId = config.get<string>('CINETPAY_SITE_ID', '');
    this.secretKey = config.get<string>('CINETPAY_SECRET_KEY', '');
    this.checkoutUrl = config.get<string>('CINETPAY_CHECKOUT_URL', 'https://api-checkout.cinetpay.com/v2/payment');
    this.checkUrl = config.get<string>('CINETPAY_CHECK_URL', 'https://api-checkout.cinetpay.com/v2/payment/check');
  }

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    // CinetPay exige un montant entier XOF multiple de 5.
    const montantXof = Math.round(input.montantCentimes / 100 / 5) * 5;
    const notifyUrl = input.publicApiUrl
      ? `${input.publicApiUrl}/webhooks/cinetpay`
      : undefined;
    const res = await fetch(this.checkoutUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: input.transactionId,
        amount: montantXof,
        currency: input.devise,
        description: input.description.replace(/[#/$_&]/g, ''),
        customer_phone_number: input.clientPhone,
        customer_email: input.clientEmail,
        notify_url: notifyUrl,
        return_url: input.successUrl,
        channels: this.moyenToChannel(input.moyen),
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      }),
    });
    const body = (await res.json()) as { code?: string; data?: { token?: string; payment_url?: string } };
    if (!res.ok || body.code !== '201' || !body.data?.token) {
      this.logger.error(`CinetPay initiate échoué: ${res.status} code=${body.code}`);
      throw new Error(`CINETPAY_INITIATE_FAILED:${res.status}`);
    }
    return {
      referenceExterne: body.data.token,
      instructions: body.data.payment_url,
      raw: body,
    };
  }

  /** Univers de guichet CinetPay (docs : ALL|MOBILE_MONEY|CREDIT_CARD|WALLET). */
  private moyenToChannel(moyen: MoyenPaiement): string {
    switch (moyen) {
      case 'carte': return 'CREDIT_CARD';
      case 'tmoney':
      case 'moov':
      case 'flooz': return 'MOBILE_MONEY';
      default: return 'ALL';
    }
  }

  /**
   * Notification CinetPay : POST form-urlencoded.
   * `x-token` = HMAC-SHA256 hex de la concaténation de TOUTES les valeurs
   * POST dans l'ordre reçu (équivalent PHP `implode('', $_POST)`),
   * clé = secret_key marchand.
   */
  async parseWebhook(headers: Record<string, unknown>, rawBody: string): Promise<WebhookEvent | null> {
    const xtoken = (headers['x-token'] as string | undefined)
      ?? (headers['x-cinetpay-signature'] as string | undefined);
    if (!xtoken || !this.secretKey) return null;

    const params = new URLSearchParams(rawBody);
    if (!params.get('cpm_trans_id')) return null;

    const dataPost = Array.from(params.values()).join('');
    const expected = createHmac('sha256', this.secretKey).update(dataPost, 'utf8').digest('hex');
    const a = Buffer.from(xtoken);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    // cpm_result '00' = succès (tableau des codes CinetPay).
    const code = params.get('cpm_result');
    const statut =
      code === '00' ? 'reussie'
      : code === '6' || code === '627' ? 'annulee' // TRANSACTION_CANCEL / cancel
      : 'echouee';
    const montant = params.get('cpm_amount');
    return {
      referenceExterne: params.get('cpm_trans_id') ?? '',
      statut,
      // cpm_amount est en XOF entier → centimes
      montantCentimes: montant ? Math.round(parseInt(montant, 10) * 100) : undefined,
      payload: Object.fromEntries(params.entries()),
    };
  }

  /**
   * Vérification serveur officielle (docs checkout/verification) —
   * à appeler après webhook pour confirmer le statut auprès de CinetPay.
   * Retourne le statut brut ('ACCEPTED', 'REFUSED', 'PENDING'…) ou null.
   */
  async checkStatus(transactionId: string): Promise<{ code?: string; status?: string; amount?: string } | null> {
    try {
      const res = await fetch(this.checkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: this.apiKey, site_id: this.siteId, transaction_id: transactionId }),
      });
      const body = (await res.json()) as { code?: string; data?: { status?: string; amount?: string } };
      return { code: body.code, status: body.data?.status, amount: body.data?.amount };
    } catch (e) {
      this.logger.warn(`CinetPay check échoué: ${String(e)}`);
      return null;
    }
  }

  async refund(referenceExterne: string, montantCentimes?: number) {
    // Endpoint refund CinetPay : /v2/refund — contrat à confirmer en sandbox.
    const res = await fetch('https://api-checkout.cinetpay.com/v2/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: referenceExterne,
        amount: montantCentimes != null ? Math.round(montantCentimes / 100 / 5) * 5 : undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { code?: string; data?: { token?: string } };
    if (!res.ok) throw new Error(`CINETPAY_REFUND_FAILED:${res.status}`);
    return { referenceExterne: body.data?.token ?? referenceExterne };
  }

  async payout(input: PayoutInput): Promise<{ referenceExterne: string }> {
    throw new Error('CINETPAY_PAYOUT_NOT_SUPPORTED'); // reversements via FedaPay uniquement
  }
}
