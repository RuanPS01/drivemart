/** Pedidos de compra (documento `orders/{id}`). Valores sempre em centavos. */

export type OrderKind = 'primary' | 'resale';

export type OrderStatus =
  /** Aguardando o Pix (compra da plataforma) ou a taxa (revenda). */
  | 'pending_payment'
  /** Revenda: taxa da plataforma paga; falta o comprador pagar o vendedor. */
  | 'fee_paid'
  /** Revenda: comprador informou que pagou o vendedor; falta o vendedor confirmar. */
  | 'buyer_marked_paid'
  | 'completed'
  /** Revenda: vendedor recusou ou não confirmou no prazo; o admin decide. */
  | 'disputed'
  | 'expired'
  | 'canceled'
  /** Pago depois de expirar (lote já vendido a outra pessoa): valor devolvido. */
  | 'refunded'
  | 'failed';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'pending_payment',
  'fee_paid',
  'buyer_marked_paid',
  'disputed',
];

export type PaymentProviderName = 'mercadopago' | 'fake';

export interface OrderPayment {
  provider: PaymentProviderName;
  /** Id do pedido no provedor (ex.: ORD... no Mercado Pago). */
  providerOrderId: string | null;
  providerPaymentId: string | null;
  /** Pix copia e cola. */
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  status: string;
  amount: number;
  paidAt: number | null;
}

export interface OrderResale {
  /** BR Code estático com a chave Pix do vendedor (valor do vendedor). */
  brCode: string;
  receiverName: string;
  pixKeyType: string;
  /** Chave parcialmente oculta, para exibir. */
  pixKeyMasked: string;
  txid: string;
  buyerMarkedPaidAt: number | null;
  sellerConfirmedAt: number | null;
  receiptPath: string | null;
  /** Prazo da etapa atual (ms desde a época). */
  stageDeadline: number | null;
  disputeReason: string | null;
}

export interface OrderDoc {
  kind: OrderKind;
  cityId: string;
  parcelId: string;
  buyerUid: string;
  buyerName: string;
  buyerEmail: string | null;
  sellerUid: string | null;
  sellerName: string | null;
  /** Preço total do imóvel. */
  price: number;
  /** Parte da plataforma (na compra primária é o preço inteiro). */
  fee: number;
  /** Parte do vendedor (zero na compra primária). */
  sellerAmount: number;
  status: OrderStatus;
  /** Validade do pagamento atual (ms). */
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  payment: OrderPayment;
  resale: OrderResale | null;
  refund: { status: 'pending' | 'done' | 'failed'; reason: string; at: number } | null;
  /** Decisão do admin numa disputa. */
  resolution?: { by: string; outcome: 'complete' | 'cancel'; note: string | null; at: number };
}

/** Transições permitidas da máquina de estados dos pedidos. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['completed', 'fee_paid', 'expired', 'canceled', 'refunded', 'failed'],
  fee_paid: ['buyer_marked_paid', 'expired', 'canceled', 'disputed'],
  buyer_marked_paid: ['completed', 'disputed'],
  disputed: ['completed', 'canceled'],
  completed: [],
  expired: ['refunded'],
  canceled: ['refunded'],
  refunded: [],
  failed: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Valor em reais com duas casas, no formato exigido pelas APIs ("123.45"). */
export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}
