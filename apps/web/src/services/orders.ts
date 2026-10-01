import { doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  DEFAULT_PRICING,
  lotPrice,
  type LayoutLot,
  type OrderDoc,
  type PricingConfig,
} from '@drivemart/shared';
import { firebase } from './firebase';

export interface PrimaryOrderResult {
  orderId: string;
  amount: number;
  qrCode: string;
  qrCodeBase64: string | null;
  expiresAt: number;
}

function fb() {
  const s = firebase();
  if (!s) throw new Error('O servidor do jogo não está configurado.');
  return s;
}

/** Mensagem legível de um erro de função callable. */
export function callableError(err: unknown): string {
  const e = err as { message?: string; code?: string };
  if (e?.code === 'functions/unavailable' || e?.code === 'functions/internal') {
    return e.message && !/^internal$/i.test(e.message)
      ? e.message
      : 'Servidor indisponível. Tente de novo em instantes.';
  }
  return e?.message || 'Algo deu errado. Tente de novo.';
}

export async function createPrimaryOrder(parcelId: string): Promise<PrimaryOrderResult> {
  const fn = httpsCallable<{ parcelId: string }, PrimaryOrderResult>(fb().functions, 'createPrimaryOrder');
  return (await fn({ parcelId })).data;
}

export async function cancelOrder(orderId: string): Promise<void> {
  await httpsCallable(fb().functions, 'cancelOrder')({ orderId });
}

export async function devSimulatePayment(orderId: string): Promise<string> {
  const r = await httpsCallable<{ orderId: string }, { result: string }>(
    fb().functions,
    'devSimulatePayment',
  )({ orderId });
  return r.data.result;
}

export function watchOrder(orderId: string, cb: (o: OrderDoc | null) => void): Unsubscribe {
  return onSnapshot(
    doc(fb().db, 'orders', orderId),
    (s) => cb((s.data() as OrderDoc | undefined) ?? null),
    () => cb(null),
  );
}

let pricingCache: (PricingConfig & { overrides?: Record<string, number> }) | null = null;

/** Preço atual de um lote da plataforma (mesma fórmula das functions; o servidor confirma ao gerar o Pix). */
export async function currentPrice(lot: LayoutLot): Promise<number> {
  const s = firebase();
  if (!s) return lot.pr;
  if (!pricingCache) {
    try {
      const snap = await getDoc(doc(s.db, 'config', 'pricing'));
      pricingCache = { ...DEFAULT_PRICING, ...(snap.data() as Partial<PricingConfig> | undefined) };
    } catch {
      return lot.pr;
    }
  }
  const override = pricingCache.overrides?.[lot.id];
  if (typeof override === 'number' && override > 0) return override;
  return lotPrice({ area: lot.a, floors: lot.fl, orla: lot.o === 1 }, pricingCache);
}
