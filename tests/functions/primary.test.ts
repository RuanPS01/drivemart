import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseBrCode, type OrderDoc, type ParcelDoc } from '@drivemart/shared';
import { call, createUser, PROJECT, waitFor, type TestUser } from '../helpers';

if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();

const catalog = (): ParcelDoc => ({
  cityId: 'rio',
  basePrice: 24000,
  area: 77,
  floors: 3,
  height: 9.4,
  sector: 'D1',
  orla: false,
  region: 'rio_9_9',
  purchasable: true,
});

async function seed(id: string): Promise<void> {
  await db.doc(`parcels/${id}`).set(catalog());
}

describe('compra primária (functions no emulador, provedor de teste)', () => {
  let buyer: TestUser;
  let other: TestUser;
  let unverified: TestUser;

  beforeAll(async () => {
    buyer = await createUser('Comprador', true);
    other = await createUser('Outra', true);
    unverified = await createUser('SemConfirmar', false);
  });

  it('exige login e e-mail confirmado', async () => {
    await seed('rio-test01');
    const anon = await call('createPrimaryOrder', { parcelId: 'rio-test01' });
    expect(anon.error?.status).toBe('UNAUTHENTICATED');
    const r = await call('createPrimaryOrder', { parcelId: 'rio-test01' }, unverified);
    expect(r.error?.status).toBe('FAILED_PRECONDITION');
    expect(r.error?.message).toMatch(/Confirme seu e-mail/);
  });

  it('rejeita lote inexistente ou ID inválido', async () => {
    expect((await call('createPrimaryOrder', { parcelId: '../x' }, buyer)).error?.status).toBe(
      'INVALID_ARGUMENT',
    );
    expect((await call('createPrimaryOrder', { parcelId: 'rio-nadaaa' }, buyer)).error?.status).toBe(
      'NOT_FOUND',
    );
  });

  it('reserva, gera Pix, bloqueia concorrência e transfere a posse ao pagar', async () => {
    await seed('rio-test02');
    const r = await call<{ orderId: string; amount: number; qrCode: string; expiresAt: number }>(
      'createPrimaryOrder',
      { parcelId: 'rio-test02' },
      buyer,
    );
    expect(r.ok).toBe(true);
    const { orderId, amount, qrCode } = r.data!;
    expect(amount).toBe(24000);
    expect(parseBrCode(qrCode)['54']).toBe('240.00');

    const parcel = (await db.doc('parcels/rio-test02').get()).data() as ParcelDoc;
    expect(parcel.status).toBe('reserved');
    expect(parcel.reservation?.orderId).toBe(orderId);

    // Mesmo comprador pedindo de novo recebe o mesmo pedido.
    const again = await call<{ orderId: string }>('createPrimaryOrder', { parcelId: 'rio-test02' }, buyer);
    expect(again.data?.orderId).toBe(orderId);

    // Outra pessoa não consegue comprar enquanto está reservado.
    const blocked = await call('createPrimaryOrder', { parcelId: 'rio-test02' }, other);
    expect(blocked.error?.status).toBe('FAILED_PRECONDITION');

    // Só o comprador pode simular o pagamento do próprio pedido.
    expect((await call('devSimulatePayment', { orderId }, other)).error?.status).toBe('PERMISSION_DENIED');
    const paid = await call<{ result: string }>('devSimulatePayment', { orderId }, buyer);
    expect(paid.data?.result).toBe('completed');

    const order = (await db.doc(`orders/${orderId}`).get()).data() as OrderDoc;
    expect(order.status).toBe('completed');
    const owned = (await db.doc('parcels/rio-test02').get()).data() as ParcelDoc;
    expect(owned.status).toBe('owned');
    expect(owned.ownerUid).toBe(buyer.uid);
    expect(owned.reservation).toBeUndefined();

    // O trigger publica o estado no cityState da região.
    const entry = await waitFor(async () => {
      const s = await db.doc('cityState/rio_9_9').get();
      return (s.data()?.parcels as Record<string, { s: string; ou: string }> | undefined)?.['rio-test02'];
    });
    expect(entry).toMatchObject({ s: 'owned', ou: buyer.uid });

    // Pagamento repetido (webhook duplicado) não muda nada.
    expect((await call<{ result: string }>('devSimulatePayment', { orderId }, buyer)).data?.result).toBe(
      'ignored',
    );
    // Já tem dono: ninguém mais compra pela plataforma.
    expect((await call('createPrimaryOrder', { parcelId: 'rio-test02' }, other)).error?.status).toBe(
      'FAILED_PRECONDITION',
    );
  });

  it('cancelar libera o lote para outras pessoas', async () => {
    await seed('rio-test03');
    const r = await call<{ orderId: string }>('createPrimaryOrder', { parcelId: 'rio-test03' }, buyer);
    expect((await call('cancelOrder', { orderId: r.data!.orderId }, other)).error?.status).toBe(
      'PERMISSION_DENIED',
    );
    const c = await call<{ status: string }>('cancelOrder', { orderId: r.data!.orderId }, buyer);
    expect(c.data?.status).toBe('canceled');
    const parcel = (await db.doc('parcels/rio-test03').get()).data() as ParcelDoc;
    expect(parcel.status).toBe('available');
    const o2 = await call<{ orderId: string }>('createPrimaryOrder', { parcelId: 'rio-test03' }, other);
    expect(o2.ok).toBe(true);
    // Pagamento do pedido cancelado que chega depois é estornado.
    const late = await call<{ result: string }>('devSimulatePayment', { orderId: r.data!.orderId }, buyer);
    expect(late.data?.result).toBe('refunded');
    const order = (await db.doc(`orders/${r.data!.orderId}`).get()).data() as OrderDoc;
    expect(order.refund?.status).toBe('done');
  });
});
