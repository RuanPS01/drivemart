import { FieldValue } from 'firebase-admin/firestore';
import { toCityStateEntry, type CityStateEntry, type ParcelDoc } from '@drivemart/shared';
import { db } from '../lib/firebase';

function same(a: CityStateEntry | null, b: CityStateEntry | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Mantém os resumos públicos (`cityState/{região}` e `cityIndex/{cidade}`) em dia
 * sempre que um lote muda. O cliente lê só esses documentos, nunca a coleção inteira.
 */
export async function syncParcelState(
  parcelId: string,
  before: ParcelDoc | undefined,
  after: ParcelDoc | undefined,
): Promise<boolean> {
  const ref = after ?? before;
  if (!ref?.region || !ref.cityId) return false;
  const prev = before ? toCityStateEntry(before) : null;
  const next = after ? toCityStateEntry(after) : null;
  if (same(prev, next) && before?.region === after?.region) return false;
  const batch = db.batch();
  if (before?.region && after?.region && before.region !== after.region) {
    batch.set(
      db.doc(`cityState/${before.region}`),
      { parcels: { [parcelId]: FieldValue.delete() } },
      { merge: true },
    );
  }
  batch.set(
    db.doc(`cityState/${ref.region}`),
    { cityId: ref.cityId, parcels: { [parcelId]: next ?? FieldValue.delete() } },
    { merge: true },
  );
  batch.set(
    db.doc(`cityIndex/${ref.cityId}`),
    {
      forSale: { [parcelId]: next?.s === 'for_sale' ? (next.p ?? 0) : FieldValue.delete() },
      owned: { [parcelId]: next && next.s !== 'reserved' ? (next.ou ?? '') : FieldValue.delete() },
    },
    { merge: true },
  );
  await batch.commit();
  return true;
}
