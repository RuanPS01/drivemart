import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { DEFAULT_PLATFORM, type OrderDoc, type PixKeyType, type PlatformConfig } from '@drivemart/shared';
import { firebase } from './firebase';

function fb() {
  const s = firebase();
  if (!s) throw new Error('O servidor do jogo não está configurado.');
  return s;
}

export type OrderWithId = OrderDoc & { id: string };

let platformCache: PlatformConfig | null = null;

/** Taxa, prazos e limites da revenda (`config/platform`). */
export async function platformSettings(): Promise<PlatformConfig> {
  if (platformCache) return platformCache;
  const s = firebase();
  if (!s) return DEFAULT_PLATFORM;
  try {
    const snap = await getDoc(doc(s.db, 'config', 'platform'));
    platformCache = { ...DEFAULT_PLATFORM, ...(snap.data() as Partial<PlatformConfig> | undefined) };
  } catch {
    return DEFAULT_PLATFORM;
  }
  return platformCache;
}

export interface SaleForm {
  parcelId: string;
  price: number;
  pixKeyType: PixKeyType;
  pixKey: string;
  receiverName: string;
  receiverCity: string;
}

export interface SalePrivate {
  pixKeyType: PixKeyType;
  pixKey: string;
  receiverName: string;
  receiverCity: string;
}

/** Dados de recebimento já informados pelo dono (só ele consegue ler). */
export async function loadSalePrivate(parcelId: string): Promise<SalePrivate | null> {
  try {
    const snap = await getDoc(doc(fb().db, 'parcels', parcelId, 'private', 'sale'));
    return (snap.data() as SalePrivate | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function listForSale(form: SaleForm): Promise<{ fee: number; seller: number }> {
  const r = await httpsCallable<SaleForm, { fee: number; seller: number }>(
    fb().functions,
    'listParcelForSale',
  )(form);
  return r.data;
}

export async function unlistParcel(parcelId: string): Promise<void> {
  await httpsCallable(fb().functions, 'unlistParcel')({ parcelId });
}

export interface ResaleStart {
  orderId: string;
  price: number;
  fee: number;
  sellerAmount: number;
  qrCode: string;
  qrCodeBase64: string | null;
  expiresAt: number;
}

export async function startResale(parcelId: string): Promise<ResaleStart> {
  const r = await httpsCallable<{ parcelId: string }, ResaleStart>(
    fb().functions,
    'startResaleOrder',
  )({ parcelId });
  return r.data;
}

export const RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
export const MAX_RECEIPT = 5 * 1024 * 1024;

/** Envia o comprovante do Pix ao vendedor (opcional) e devolve o caminho no Storage. */
export async function uploadReceipt(orderId: string, file: File): Promise<string> {
  if (!RECEIPT_TYPES.includes(file.type)) throw new Error('Use imagem (PNG, JPG, WebP) ou PDF.');
  if (file.size > MAX_RECEIPT) throw new Error('O comprovante pode ter até 5 MB.');
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]!.replace('jpeg', 'jpg');
  const path = `receipts/${orderId}/${crypto.randomUUID()}.${ext}`;
  await uploadBytes(ref(fb().storage, path), file, { contentType: file.type });
  return path;
}

export async function receiptUrl(path: string): Promise<string> {
  return getDownloadURL(ref(fb().storage, path));
}

export async function markResalePaid(orderId: string, receiptPath?: string): Promise<void> {
  await httpsCallable(fb().functions, 'markResalePaid')({ orderId, receiptPath });
}

export async function confirmResaleReceipt(orderId: string): Promise<void> {
  await httpsCallable(fb().functions, 'confirmResaleReceipt')({ orderId });
}

export async function rejectResaleReceipt(orderId: string, reason: string): Promise<void> {
  await httpsCallable(fb().functions, 'rejectResaleReceipt')({ orderId, reason });
}

const OPEN_FOR_BUYER = ['pending_payment', 'fee_paid', 'buyer_marked_paid', 'disputed'];
const OPEN_FOR_SELLER = ['fee_paid', 'buyer_marked_paid', 'disputed'];

function watchOrders(
  field: 'buyerUid' | 'sellerUid',
  uid: string,
  statuses: string[],
  cb: (list: OrderWithId[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(fb().db, 'orders'), where(field, '==', uid), where('status', 'in', statuses)),
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as OrderDoc) }))
          .sort((a, b) => b.createdAt - a.createdAt),
      ),
    () => cb([]),
  );
}

/** Compras em andamento do usuário (revenda e compra da plataforma). */
export function watchBuyerOrders(uid: string, cb: (list: OrderWithId[]) => void): Unsubscribe {
  return watchOrders('buyerUid', uid, OPEN_FOR_BUYER, cb);
}

/** Vendas do usuário que dependem dele ou estão em análise. */
export function watchSellerOrders(uid: string, cb: (list: OrderWithId[]) => void): Unsubscribe {
  return watchOrders('sellerUid', uid, OPEN_FOR_SELLER, cb);
}

export type ReportReason = 'ofensivo' | 'golpe' | 'direitos' | 'outro';

export const REPORT_REASONS: Record<ReportReason, string> = {
  ofensivo: 'Conteúdo ofensivo ou impróprio',
  golpe: 'Golpe, fraude ou link perigoso',
  direitos: 'Uso indevido de marca ou direitos autorais',
  outro: 'Outro motivo',
};

export async function createReport(
  parcelId: string,
  reporterUid: string,
  reason: ReportReason,
  details: string,
): Promise<void> {
  await addDoc(collection(fb().db, 'reports'), {
    parcelId,
    reporterUid,
    reason,
    details: details.trim().slice(0, 500),
    status: 'open',
    createdAt: Date.now(),
  });
}
