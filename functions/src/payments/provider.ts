import type { PaymentProviderName } from '@drivemart/shared';

export interface PixChargeInput {
  orderId: string;
  amountCents: number;
  description: string;
  payerEmail: string | null;
  payerName: string;
  expiresMinutes: number;
}

export interface PixCharge {
  providerOrderId: string;
  providerPaymentId: string | null;
  qrCode: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  status: string;
}

export type ChargeState = 'pending' | 'paid' | 'expired' | 'canceled' | 'refunded' | 'failed';

export interface ChargeStatus {
  state: ChargeState;
  providerStatus: string;
  externalReference: string | null;
  paidCents: number;
  providerPaymentId: string | null;
}

/** Provedor de pagamento Pix. Stripe (cartão) entra depois implementando esta mesma interface. */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createPix(input: PixChargeInput): Promise<PixCharge>;
  getStatus(providerOrderId: string): Promise<ChargeStatus>;
  refund(providerOrderId: string): Promise<void>;
  cancel(providerOrderId: string): Promise<void>;
}
