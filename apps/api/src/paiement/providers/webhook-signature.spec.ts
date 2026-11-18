import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { FedapayProvider } from './fedapay.provider';
import { CinetpayProvider } from './cinetpay.provider';

/**
 * Tests unitaires de la vérification de signature webhook — schémas
 * réels vérifiés : FedaPay `t=,s=` (SDK officiel fedapay@1.2.5) et
 * CinetPay `x-token` (docs checkout/hmac). Pas de DB ni réseau.
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

  // Payload réel : { name: 'transaction.approved', entity: {transaction…} }
  const body = JSON.stringify({
    name: 'transaction.approved',
    entity: { reference: 'fedapay-ref-1', amount: 5000, status: 'approved' },
  });

  const headerFor = (payload: string, ts = Math.floor(Date.now() / 1000)) => {
    const sig = createHmac('sha256', secret).update(`${ts}.${payload}`, 'utf8').digest('hex');
    return `t=${ts},s=${sig}`;
  };

  it('accepte une signature valide → reussie, montant XOF→centimes', async () => {
    const event = await provider.parseWebhook(
      { 'x-fedapay-signature': headerFor(body) }, body,
    );
    expect(event).not.toBeNull();
    expect(event!.referenceExterne).toBe('fedapay-ref-1');
    expect(event!.statut).toBe('reussie');
    expect(event!.montantCentimes).toBe(500000);
  });

  it('rejette une signature invalide', async () => {
    const event = await provider.parseWebhook(
      { 'x-fedapay-signature': 't=1,s=' + 'deadbeef'.repeat(8) }, body,
    );
    expect(event).toBeNull();
  });

  it('rejette un corps modifié après signature', async () => {
    const sig = headerFor(body);
    const tampered = body.replace('approved', 'declined');
    expect(await provider.parseWebhook({ 'x-fedapay-signature': sig }, tampered)).toBeNull();
  });

  it('rejette un timestamp hors tolérance (> 300 s)', async () => {
    const old = Math.floor(Date.now() / 1000) - 400;
    expect(
      await provider.parseWebhook({ 'x-fedapay-signature': headerFor(body, old) }, body),
    ).toBeNull();
  });

  it('rejette sans header signature', async () => {
    expect(await provider.parseWebhook({}, body)).toBeNull();
  });

  it('transaction.created → ignoree (non terminal)', async () => {
    const b = JSON.stringify({ name: 'transaction.created', entity: { reference: 'r2', status: 'pending' } });
    const event = await provider.parseWebhook({ 'x-fedapay-signature': headerFor(b) }, b);
    expect(event!.statut).toBe('ignoree');
  });

  it('transaction.declined → echouee', async () => {
    const b = JSON.stringify({ name: 'transaction.declined', entity: { reference: 'r3', status: 'declined' } });
    const event = await provider.parseWebhook({ 'x-fedapay-signature': headerFor(b) }, b);
    expect(event!.statut).toBe('echouee');
  });
});

describe('CinetpayProvider.parseWebhook', () => {
  const secret = 'cp_secret_test';
  const provider = new CinetpayProvider(config({
    CINETPAY_API_KEY: 'ak', CINETPAY_SITE_ID: '42', CINETPAY_SECRET_KEY: secret,
  }));

  // x-token = HMAC-SHA256 hex de implode('', valeurs POST dans l'ordre)
  const build = (entries: [string, string][]) => {
    const params = new URLSearchParams(entries);
    const dataPost = Array.from(params.values()).join('');
    const xtoken = createHmac('sha256', secret).update(dataPost, 'utf8').digest('hex');
    return { body: params.toString(), xtoken };
  };

  it('accepte une notification valide → reussie', async () => {
    const { body, xtoken } = build([
      ['cpm_site_id', '42'], ['cpm_trans_id', 'CP-123'],
      ['cpm_amount', '5000'], ['cpm_currency', 'XOF'], ['cpm_result', '00'],
    ]);
    const event = await provider.parseWebhook({ 'x-token': xtoken }, body);
    expect(event).not.toBeNull();
    expect(event!.referenceExterne).toBe('CP-123');
    expect(event!.statut).toBe('reussie');
    expect(event!.montantCentimes).toBe(500000);
  });

  it('rejette un x-token invalide', async () => {
    const { body } = build([['cpm_trans_id', 'CP-1'], ['cpm_result', '00']]);
    expect(await provider.parseWebhook({ 'x-token': 'bad' }, body)).toBeNull();
  });

  it('rejette un montant modifié après signature', async () => {
    const { body, xtoken } = build([
      ['cpm_trans_id', 'CP-1'], ['cpm_amount', '5000'], ['cpm_result', '00'],
    ]);
    const tampered = body.replace('5000', '999999');
    expect(await provider.parseWebhook({ 'x-token': xtoken }, tampered)).toBeNull();
  });

  it('cpm_result 627 (TRANSACTION_CANCEL) → annulee', async () => {
    const { body, xtoken } = build([
      ['cpm_trans_id', 'CP-9'], ['cpm_amount', '1000'], ['cpm_result', '627'],
    ]);
    const event = await provider.parseWebhook({ 'x-token': xtoken }, body);
    expect(event!.statut).toBe('annulee');
  });

  it('rejette sans cpm_trans_id', async () => {
    const { body, xtoken } = build([['cpm_result', '00']]);
    expect(await provider.parseWebhook({ 'x-token': xtoken }, body)).toBeNull();
  });
});
