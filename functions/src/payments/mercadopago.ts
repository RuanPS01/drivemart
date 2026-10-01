import { MercadoPagoConfig, Order } from 'mercadopago';
import { centsToDecimal } from '@drivemart/shared';
import type { ChargeState, ChargeStatus, PaymentProvider, PixCharge, PixChargeInput } from './provider';

/** Converte o status do pedido do Mercado Pago (API de Orders) para o estado interno. */
export function mapOrderStatus(status: string | undefined, detail: string | undefined): ChargeState {
  switch (status) {
    case 'processed':
      return 'paid';
    case 'expired':
      return 'expired';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    case 'refunded':
      return 'refunded';
    case 'failed':
      return 'failed';
    default:
      return detail === 'accredited' ? 'paid' : 'pending';
  }
}

/** Pix pelo Checkout Transparente via API de Orders do Mercado Pago. */
export function mercadoPagoProvider(accessToken: string, notificationUrl: string): PaymentProvider {
  const client = new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } });
  const orders = new Order(client);
  return {
    name: 'mercadopago',
    async createPix(input: PixChargeInput): Promise<PixCharge> {
      const amount = centsToDecimal(input.amountCents);
      const [first, ...rest] = input.payerName.split(' ');
      const res = await orders.create({
        body: {
          type: 'online',
          processing_mode: 'automatic',
          external_reference: input.orderId,
          description: input.description.slice(0, 120),
          total_amount: amount,
          payer: {
            email: input.payerEmail ?? undefined,
            first_name: first || undefined,
            last_name: rest.join(' ') || undefined,
          },
          transactions: {
            payments: [
              {
                amount,
                payment_method: { id: 'pix', type: 'bank_transfer' },
                expiration_time: `PT${input.expiresMinutes}M`,
              },
            ],
          },
          ...(notificationUrl ? { config: { online: { callback_url: notificationUrl } } } : {}),
        },
        requestOptions: { idempotencyKey: input.orderId },
      });
      const payment = res.transactions?.payments?.[0];
      const pm = payment?.payment_method;
      if (!res.id || !pm?.qr_code) throw new Error('Mercado Pago não retornou o QR Code do Pix.');
      return {
        providerOrderId: res.id,
        providerPaymentId: payment?.id ?? null,
        qrCode: pm.qr_code,
        qrCodeBase64: pm.qr_code_base64 ?? null,
        ticketUrl: pm.ticket_url ?? null,
        status: res.status ?? 'action_required',
      };
    },
    async getStatus(providerOrderId: string): Promise<ChargeStatus> {
      const res = await orders.get({ id: providerOrderId });
      const payment = res.transactions?.payments?.[0];
      const paid = Number(res.total_paid_amount ?? payment?.paid_amount ?? 0);
      return {
        state: mapOrderStatus(res.status, res.status_detail),
        providerStatus: `${res.status ?? ''}/${res.status_detail ?? ''}`,
        externalReference: res.external_reference ?? null,
        paidCents: Math.round(paid * 100),
        providerPaymentId: payment?.id ?? null,
      };
    },
    async refund(providerOrderId: string): Promise<void> {
      await orders.refund({
        id: providerOrderId,
        requestOptions: { idempotencyKey: `refund-${providerOrderId}` },
      });
    },
    async cancel(providerOrderId: string): Promise<void> {
      await orders.cancel({
        id: providerOrderId,
        requestOptions: { idempotencyKey: `cancel-${providerOrderId}` },
      });
    },
  };
}
