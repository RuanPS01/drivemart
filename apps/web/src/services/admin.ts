import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  DEFAULT_PLATFORM,
  DEFAULT_PRICING,
  type OrderDoc,
  type OrderStatus,
  type ParcelDoc,
  type PlatformConfig,
  type PricingConfig,
} from '@drivemart/shared';
import { firebase } from './firebase';
import type { OrderWithId, ReportReason } from './resale';

function fb() {
  const s = firebase();
  if (!s) throw new Error('O servidor do jogo não está configurado.');
  return s;
}

/** Pedidos mais recentes, opcionalmente filtrados por situação. */
export function watchOrders(
  status: OrderStatus | 'all',
  cb: (list: OrderWithId[]) => void,
  max = 50,
): Unsubscribe {
  const base = collection(fb().db, 'orders');
  const q =
    status === 'all'
      ? query(base, orderBy('createdAt', 'desc'), limit(max))
      : query(base, where('status', '==', status), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as OrderDoc) }))),
    (err) => {
      console.error('[admin] pedidos', err);
      cb([]);
    },
  );
}

export interface ReportDoc {
  id: string;
  parcelId: string;
  reporterUid: string;
  reason: ReportReason;
  details?: string;
  status: 'open' | 'dismissed' | 'actioned';
  createdAt: number;
}

export function watchOpenReports(cb: (list: ReportDoc[]) => void): Unsubscribe {
  return onSnapshot(
    query(
      collection(fb().db, 'reports'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
      limit(100),
    ),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReportDoc, 'id'>) }))),
    (err) => {
      console.error('[admin] denúncias', err);
      cb([]);
    },
  );
}

export async function getParcel(id: string): Promise<ParcelDoc | null> {
  const snap = await getDoc(doc(fb().db, 'parcels', id));
  return (snap.data() as ParcelDoc | undefined) ?? null;
}

export async function resolveDispute(
  orderId: string,
  outcome: 'complete' | 'cancel',
  refundFee: boolean,
  note: string,
): Promise<void> {
  await httpsCallable(fb().functions, 'adminResolveDispute')({ orderId, outcome, refundFee, note });
}

export async function moderateParcel(parcelId: string, blocked: boolean, clearLink: boolean): Promise<void> {
  await httpsCallable(fb().functions, 'adminModerateParcel')({ parcelId, blocked, clearLink });
}

export async function resolveReport(reportId: string, action: 'dismiss' | 'block'): Promise<void> {
  await httpsCallable(fb().functions, 'adminResolveReport')({ reportId, action });
}

export type PricingDoc = PricingConfig & { overrides?: Record<string, number> };

export async function loadConfig(): Promise<{ pricing: PricingDoc; platform: PlatformConfig }> {
  const [p, f] = await Promise.all([
    getDoc(doc(fb().db, 'config', 'pricing')),
    getDoc(doc(fb().db, 'config', 'platform')),
  ]);
  return {
    pricing: { ...DEFAULT_PRICING, overrides: {}, ...(p.data() as Partial<PricingDoc> | undefined) },
    platform: { ...DEFAULT_PLATFORM, ...(f.data() as Partial<PlatformConfig> | undefined) },
  };
}

export async function saveConfig(pricing: PricingDoc, platform: PlatformConfig): Promise<void> {
  await Promise.all([
    setDoc(doc(fb().db, 'config', 'pricing'), pricing),
    setDoc(doc(fb().db, 'config', 'platform'), platform),
  ]);
}
