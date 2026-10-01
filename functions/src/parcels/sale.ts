import { FieldValue } from 'firebase-admin/firestore';
import {
  normalizePixKey,
  normalizeText,
  splitResale,
  type ParcelDoc,
  type PixKeyType,
} from '@drivemart/shared';
import { platformConfig } from '../config';
import type { Caller } from '../lib/auth';
import { fail } from '../lib/errors';
import { db } from '../lib/firebase';

const PARCEL_ID = /^[a-z]{2,10}-[0-9a-z]{6}$/;
const KEY_TYPES: PixKeyType[] = ['cpf', 'cnpj', 'email', 'phone', 'random'];

/** Dados privados da venda (`parcels/{id}/private/sale`), lidos só pelo dono e pelas functions. */
export interface SalePrivate {
  pixKeyType: PixKeyType;
  pixKey: string;
  receiverName: string;
  receiverCity: string;
  updatedAt: number;
}

export interface ListInput {
  parcelId: string;
  price: number;
  pixKeyType: PixKeyType;
  pixKey: string;
  receiverName: string;
  receiverCity: string;
}

/** Coloca o imóvel à venda com o preço do dono e a chave Pix para receber 90%. */
export async function listParcelForSale(
  caller: Caller,
  input: ListInput,
): Promise<{ fee: number; seller: number }> {
  if (typeof input.parcelId !== 'string' || !PARCEL_ID.test(input.parcelId))
    fail('invalid-argument', 'Imóvel inválido.');
  const platform = await platformConfig();
  const price = Math.round(Number(input.price));
  if (!Number.isFinite(price) || price < platform.minResaleCents || price > platform.maxResaleCents) {
    fail(
      'invalid-argument',
      `O preço deve ficar entre R$ ${platform.minResaleCents / 100} e R$ ${platform.maxResaleCents / 100}.`,
    );
  }
  if (!KEY_TYPES.includes(input.pixKeyType)) fail('invalid-argument', 'Tipo de chave Pix inválido.');
  const pixKey = normalizePixKey(input.pixKeyType, String(input.pixKey ?? ''));
  if (!pixKey) fail('invalid-argument', 'Chave Pix inválida para o tipo escolhido.');
  const receiverName = normalizeText(String(input.receiverName ?? ''), 25);
  const receiverCity = normalizeText(String(input.receiverCity ?? ''), 15);
  if (receiverName.length < 3) fail('invalid-argument', 'Informe o nome de quem recebe o Pix.');
  if (receiverCity.length < 2) fail('invalid-argument', 'Informe a cidade de quem recebe o Pix.');

  const ref = db.doc(`parcels/${input.parcelId}`);
  await db.runTransaction(async (tx) => {
    const p = (await tx.get(ref)).data() as ParcelDoc | undefined;
    if (!p) fail('not-found', 'Imóvel não encontrado.');
    if (p.ownerUid !== caller.uid) fail('permission-denied', 'Este imóvel não é seu.');
    if (p.status === 'reserved') fail('failed-precondition', 'Há uma venda em andamento para este imóvel.');
    tx.update(ref, { status: 'for_sale', salePrice: price, updatedAt: Date.now() });
    const priv: SalePrivate = {
      pixKeyType: input.pixKeyType,
      pixKey,
      receiverName,
      receiverCity,
      updatedAt: Date.now(),
    };
    tx.set(ref.collection('private').doc('sale'), priv);
  });
  return splitResale(price, platform.resaleFeeBps);
}

export async function unlistParcel(caller: Caller, parcelId: string): Promise<{ ok: true }> {
  if (typeof parcelId !== 'string' || !PARCEL_ID.test(parcelId)) fail('invalid-argument', 'Imóvel inválido.');
  const ref = db.doc(`parcels/${parcelId}`);
  await db.runTransaction(async (tx) => {
    const p = (await tx.get(ref)).data() as ParcelDoc | undefined;
    if (!p) fail('not-found', 'Imóvel não encontrado.');
    if (p.ownerUid !== caller.uid) fail('permission-denied', 'Este imóvel não é seu.');
    if (p.status === 'reserved')
      fail('failed-precondition', 'Há uma venda em andamento. Ela precisa terminar antes.');
    if (p.status !== 'for_sale') return;
    tx.update(ref, { status: 'owned', salePrice: FieldValue.delete(), updatedAt: Date.now() });
    tx.delete(ref.collection('private').doc('sale'));
  });
  return { ok: true };
}
