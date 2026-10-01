import { FieldValue } from 'firebase-admin/firestore';
import { getDownloadURL } from 'firebase-admin/storage';
import sharp from 'sharp';
import type { FacadeFit, FacadeRegion, ParcelDoc, ParcelFacade } from '@drivemart/shared';
import type { Caller } from '../lib/auth';
import { fail } from '../lib/errors';
import { bucket, db } from '../lib/firebase';

const PARCEL_ID = /^[a-z]{2,10}-[0-9a-z]{6}$/;
export const MAX_UPLOAD = 8 * 1024 * 1024;
const MAX_STATIC = 1024;
const MAX_GIF = 512;
const MAX_FRAMES = 120;

async function ownedParcel(caller: Caller, parcelId: string): Promise<ParcelDoc> {
  if (typeof parcelId !== 'string' || !PARCEL_ID.test(parcelId)) fail('invalid-argument', 'Imóvel inválido.');
  const snap = await db.doc(`parcels/${parcelId}`).get();
  const p = snap.data() as ParcelDoc | undefined;
  if (!p) fail('not-found', 'Imóvel não encontrado.');
  if (p.ownerUid !== caller.uid) fail('permission-denied', 'Este imóvel não é seu.');
  return p;
}

/** Aceita só links https com domínio; devolve a URL normalizada ou nulo para apagar. */
export function normalizeLink(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > 2048) fail('invalid-argument', 'Link inválido.');
  let url: URL;
  try {
    url = new URL(raw.trim().match(/^[a-z][a-z0-9+.-]*:/i) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    fail('invalid-argument', 'Link inválido.');
  }
  if (url.protocol !== 'https:') fail('invalid-argument', 'Use um link que comece com https://');
  if (!url.hostname.includes('.') || url.username || url.password) fail('invalid-argument', 'Link inválido.');
  return url.toString();
}

export function normalizeName(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') fail('invalid-argument', 'Nome inválido.');
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length > 40) fail('invalid-argument', 'O nome pode ter até 40 caracteres.');
  return s || null;
}

/** Nome e link do estabelecimento. */
export async function updateParcelInfo(
  caller: Caller,
  data: { parcelId: string; displayName?: unknown; linkUrl?: unknown },
): Promise<{ ok: true }> {
  await ownedParcel(caller, data.parcelId);
  await db.doc(`parcels/${data.parcelId}`).update({
    displayName: normalizeName(data.displayName),
    linkUrl: normalizeLink(data.linkUrl),
    updatedAt: Date.now(),
  });
  return { ok: true };
}

export interface FacadeInput {
  parcelId: string;
  /** Caminho do arquivo enviado (facades/<lote>/uploads/<arquivo>). */
  uploadPath: string;
  fit: FacadeFit;
  region: FacadeRegion;
  ps1: boolean;
  background: string;
}

/**
 * Processa a imagem enviada pelo dono e publica como fachada:
 * valida tipo, tamanho e quadros, reduz (estática até 1024 px em WebP; GIF até 512 px mantendo a animação)
 * e apaga o original.
 */
export async function setParcelFacade(caller: Caller, input: FacadeInput): Promise<{ url: string }> {
  await ownedParcel(caller, input.parcelId);
  const prefix = `facades/${input.parcelId}/uploads/`;
  if (
    typeof input.uploadPath !== 'string' ||
    !input.uploadPath.startsWith(prefix) ||
    input.uploadPath.includes('..')
  ) {
    fail('invalid-argument', 'Arquivo inválido.');
  }
  const fit: FacadeFit = input.fit === 'contain' ? 'contain' : 'cover';
  const region: FacadeRegion = input.region === 'ground' ? 'ground' : 'full';
  const background = /^#[0-9a-f]{6}$/i.test(input.background ?? '') ? input.background : '#000000';

  const file = bucket().file(input.uploadPath);
  const [exists] = await file.exists();
  if (!exists) fail('not-found', 'O envio não foi encontrado. Tente enviar de novo.');
  const [meta] = await file.getMetadata();
  if (Number(meta.size) > MAX_UPLOAD) {
    await file.delete().catch(() => {});
    fail('invalid-argument', 'A imagem pode ter até 8 MB.');
  }
  const [buffer] = await file.download();
  let info: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    info = await sharp(buffer, { animated: true, limitInputPixels: 4096 * 4096 * 200 }).metadata();
  } catch {
    await file.delete().catch(() => {});
    fail('invalid-argument', 'Formato de imagem não reconhecido. Use PNG, JPG, WebP ou GIF.');
  }
  const format = info.format;
  if (!format || !['png', 'jpeg', 'webp', 'gif'].includes(format)) {
    await file.delete().catch(() => {});
    fail('invalid-argument', 'Formato não aceito. Use PNG, JPG, WebP ou GIF.');
  }
  const frames = info.pages ?? 1;
  const isGif = format === 'gif' && frames > 1;
  if (frames > MAX_FRAMES) {
    await file.delete().catch(() => {});
    fail('invalid-argument', `O GIF pode ter até ${MAX_FRAMES} quadros.`);
  }

  let out: Buffer;
  let ext: string;
  let contentType: string;
  if (isGif) {
    out = await sharp(buffer, { animated: true })
      .resize({ width: MAX_GIF, height: MAX_GIF, fit: 'inside', withoutEnlargement: true })
      .gif({ effort: 7 })
      .toBuffer();
    ext = 'gif';
    contentType = 'image/gif';
  } else {
    out = await sharp(buffer)
      .rotate()
      .resize({ width: MAX_STATIC, height: MAX_STATIC, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    ext = 'webp';
    contentType = 'image/webp';
  }
  const outMeta = await sharp(out, { animated: isGif }).metadata();
  const version = Date.now();
  const publishedPath = `facades/${input.parcelId}/published/${version}.${ext}`;
  const published = bucket().file(publishedPath);
  await published.save(out, {
    contentType,
    metadata: { cacheControl: 'public, max-age=31536000, immutable' },
  });
  const url = await getDownloadURL(published);
  await file.delete().catch(() => {});

  const ref = db.doc(`parcels/${input.parcelId}`);
  const previous = ((await ref.get()).data() as ParcelDoc | undefined)?.facade?.path;
  const facade: ParcelFacade = {
    path: publishedPath,
    url,
    kind: isGif ? 'gif' : 'image',
    fit,
    region,
    ps1: input.ps1 === true,
    background,
    width: outMeta.width ?? 0,
    height: outMeta.pageHeight ?? outMeta.height ?? 0,
    moderation: 'ok',
    updatedAt: version,
  };
  await ref.update({ facade, updatedAt: Date.now() });
  if (previous && previous !== publishedPath)
    await bucket()
      .file(previous)
      .delete()
      .catch(() => {});
  return { url };
}

/** Só altera as opções de exibição da fachada já publicada (sem novo envio). */
export async function updateFacadeOptions(
  caller: Caller,
  data: { parcelId: string; fit?: FacadeFit; region?: FacadeRegion; ps1?: boolean; background?: string },
): Promise<{ ok: true }> {
  const p = await ownedParcel(caller, data.parcelId);
  if (!p.facade) fail('failed-precondition', 'Envie uma imagem primeiro.');
  await db.doc(`parcels/${data.parcelId}`).update({
    'facade.fit': data.fit === 'contain' ? 'contain' : 'cover',
    'facade.region': data.region === 'ground' ? 'ground' : 'full',
    'facade.ps1': data.ps1 === true,
    'facade.background': /^#[0-9a-f]{6}$/i.test(data.background ?? '')
      ? data.background
      : p.facade.background,
    'facade.updatedAt': Date.now(),
    updatedAt: Date.now(),
  });
  return { ok: true };
}

export async function removeParcelFacade(caller: Caller, parcelId: string): Promise<{ ok: true }> {
  const p = await ownedParcel(caller, parcelId);
  await db.doc(`parcels/${parcelId}`).update({ facade: FieldValue.delete(), updatedAt: Date.now() });
  if (p.facade?.path)
    await bucket()
      .file(p.facade.path)
      .delete()
      .catch(() => {});
  return { ok: true };
}
