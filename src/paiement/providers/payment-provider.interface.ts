import { FournisseurPaiement } from '@prisma/client';

export type MoyenPaiement = 'tmoney' | 'moov' | 'flooz' | 'carte' | 'especes' | 'virement';

export interface InitiatePaymentInput {
  transactionId: string;        // référence interne Tablya (idempotence)
  montantCentimes: number;      // XOF
  devise: string;
  moyen: MoyenPaiement;
  description: string;
  clientPhone?: string;
  clientEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
  /** URL publique de l'API (ex. https://api.tablya.app/api/v1) — sert à
   *  construire notify_url côté fournisseurs (CinetPay). */
  publicApiUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InitiatePaymentResult {
  referenceExterne: string;
  instructions?: string;        // ex. code USSD à composer
  raw?: unknown;
}

export interface WebhookEvent {
  referenceExterne: string;
  /** 'ignoree' = événement non terminal (created/updated…) — tracé, pas de transition. */
  statut: 'reussie' | 'echouee' | 'expiree' | 'annulee' | 'ignoree';
  montantCentimes?: number;
  payload: unknown;
}

export interface PayoutInput {
  referenceExterne: string;     // référence reversement Tablya
  montantCentimes: number;
  destination: string;          // numéro mobile money / RIB
  metadata?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: FournisseurPaiement;
  readonly supportedMoyens: MoyenPaiement[];
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  /** Vérifie signature + anti-rejeu ; null si non applicable. */
  parseWebhook(headers: Record<string, unknown>, rawBody: string): Promise<WebhookEvent | null>;
  refund(referenceExterne: string, montantCentimes?: number): Promise<{ referenceExterne: string }>;
  payout(input: PayoutInput): Promise<{ referenceExterne: string }>;
}
