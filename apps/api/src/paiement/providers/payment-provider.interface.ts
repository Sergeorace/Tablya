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
  metadata?: Record<string, unknown>;
}

export interface InitiatePaymentResult {
  referenceExterne: string;
  instructions?: string;        // ex. code USSD à composer
  raw?: unknown;
}

export interface WebhookEvent {
  referenceExterne: string;
  statut: 'reussie' | 'echouee' | 'expiree' | 'annulee';
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
