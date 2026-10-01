import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable } from 'firebase/storage';
import type { FacadeFit, FacadeRegion, ParcelDoc } from '@drivemart/shared';
import { firebase } from './firebase';

function fb() {
  const s = firebase();
  if (!s) throw new Error('O servidor do jogo não está configurado.');
  return s;
}

export type OwnedParcel = ParcelDoc & { id: string };

/** Imóveis do usuário, em tempo real. */
export function watchMyParcels(uid: string, cb: (list: OwnedParcel[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(fb().db, 'parcels'), where('ownerUid', '==', uid)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ParcelDoc) }))),
    () => cb([]),
  );
}

export function watchParcel(id: string, cb: (p: ParcelDoc | null) => void): Unsubscribe {
  return onSnapshot(
    doc(fb().db, 'parcels', id),
    (s) => cb((s.data() as ParcelDoc | undefined) ?? null),
    () => cb(null),
  );
}

export interface CityIndexDoc {
  forSale?: Record<string, number>;
  owned?: Record<string, string>;
}

export function watchCityIndex(cityId: string, cb: (d: CityIndexDoc) => void): Unsubscribe {
  return onSnapshot(
    doc(fb().db, 'cityIndex', cityId),
    (s) => cb((s.data() as CityIndexDoc | undefined) ?? {}),
    () => cb({}),
  );
}

export async function updateParcelInfo(
  parcelId: string,
  displayName: string,
  linkUrl: string,
): Promise<void> {
  await httpsCallable(fb().functions, 'updateParcelInfo')({ parcelId, displayName, linkUrl });
}

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_UPLOAD = 8 * 1024 * 1024;

/** Envia a imagem para a área de uploads do lote (só o dono consegue gravar lá). */
export function uploadFacade(parcelId: string, file: File, onProgress: (p: number) => void): Promise<string> {
  if (!ACCEPTED_TYPES.includes(file.type)) return Promise.reject(new Error('Use PNG, JPG, WebP ou GIF.'));
  if (file.size > MAX_UPLOAD) return Promise.reject(new Error('A imagem pode ter até 8 MB.'));
  const ext = file.type.split('/')[1]!.replace('jpeg', 'jpg');
  const path = `facades/${parcelId}/uploads/${crypto.randomUUID()}.${ext}`;
  const task = uploadBytesResumable(ref(fb().storage, path), file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (s) => onProgress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      (err) => reject(err),
      () => resolve(path),
    );
  });
}

export interface FacadeOptions {
  fit: FacadeFit;
  region: FacadeRegion;
  ps1: boolean;
  background: string;
}

export async function publishFacade(
  parcelId: string,
  uploadPath: string,
  opts: FacadeOptions,
): Promise<void> {
  await httpsCallable(fb().functions, 'setParcelFacade', { timeout: 120_000 })({
    parcelId,
    uploadPath,
    ...opts,
  });
}

export async function updateFacadeOptions(parcelId: string, opts: FacadeOptions): Promise<void> {
  await httpsCallable(fb().functions, 'updateFacadeOptions')({ parcelId, ...opts });
}

export async function removeFacade(parcelId: string): Promise<void> {
  await httpsCallable(fb().functions, 'removeParcelFacade')({ parcelId });
}
