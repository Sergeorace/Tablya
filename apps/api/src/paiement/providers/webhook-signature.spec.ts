import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { FedapayProvider } from './fedapay.provider';
import { CinetpayProvider } from './cinetpay.provider';

/**
 * Tests unitaires de la vérification de signature webhook (E4 / §6.4).
 * Pas de DB ni réseau : on teste uniquement parseWebhook.
 */

function config(overrides: Record<string, string>): ConfigService {
  return { get: (k: string, d?: string) => overrides[k] ?? d } as unknown as ConfigService;
}

describe('FedapayProvider.parseWebhook', () => {
  const secret = 'whsec_test_123';
  const provider = new FedapayProvider(config({
    FEDAPAY_SECRET_KEY: 'sk_test',
    FEDAPAY_WEBHOOK_SECRET: secret,
  }));

  const body = JSON.stringify({
    entity: { reference: 'fedapay-ref-1' },
    status: 'approved',
    amount: 5000,
  });
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

  it('accepte une signature valide et mappe approved → reussie', async () => {
    const event = await provider.parseWebhook(
      { 'x-fedapay-signature': sign(body) }, body,
    );
    expect(event).not.toBeNull();
    expect(event!.referenceExterne).toBe('fedapay-ref-1');
    expect(event!.statut).toBe('reussie');
    expect(event!.montantCentimes).toBe(500000);
  });

  it('rejette une signature invalide', async () => {
    const event = await provider.parseWebhook(
      { 'x-fedapay-signature': 'deadbeef'.repeat(8) }, body,
    );
    expect(event).toBeNull();
  });

  it('rejette un corps modifié après signature (rejeu)', async () => {
    const sig = sign(body);
    const tampered = body.replace('approved', 'declined');
    const event = await provider.parseWebhook({ 'x-fedapay-signature': sig }, tampered);
    expect(event).toBeNull();
  });

  it('rejette sans header signature', async () => {
    expect(await provider.parseWebhook({}, body)).toBeNull();
  });
});

describe('CinetpayProvider.parseWebhook', () => {
  const secret = 'cp_secret_test';
  const provider = new CinetpayProvider(config({
    CINETPAY_API_KEY: 'ak', CINETPAY_SITE_ID: '42', CINETPAY_SECRET_KEY: secret,
  }));

  const params = new URLSearchParams({
    cpm_trans_id: 'CP-123', cpm_amount: '5000', cpm_currency: 'XOF', cpm_result: '00',
  });
  const sign = (p: URLSearchParams) => createHmac('sha256', secret)
    .update(`${p.get('cpm_trans_id')}${p.get('cpm_amount')}${p.get('cpm_currency')}`)
    .digest('hex');

  it('accepte une notification valide → reussie', async () => {
    params.set('signature', sign(params));
    const event = await provider.parseWebhook({}, params.toString());
    expect(event).not.toBeNull();
    expect(event!.referenceExterne).toBe('CP-123');
    expect(event!.statut).toBe('reussie');
    expect(event!.montantCentimes).toBe(5000);
  });

  it('rejette une signature invalide', async () => {
    params.set('signature', 'bad');
    expect(await provider.parseWebhook({}, params.toString())).toBeNull();
  });

  it('rejette un montant modifié après signature', async () => {
    const p2 = new URLSearchParams(params.toString());
    p2.set('cpm_amount', '999999');
    // signature recalculée sur les anciennes valeurs → doit échouer
    p2.set('signature', sign(params));
    expect(await provider.parseWebhook({}, p2.toString())).toBeNull();
  });
});
