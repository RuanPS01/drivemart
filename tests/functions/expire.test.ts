import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import type { OrderDoc, ParcelDoc } from '@drivemart/shared';
import { PROJECT } from '../helpers';
import { expireOrders } from '../../functions/src/orders/expire';
import { setProviderForTests } from '../../functions/src/payments';
import { fakeProvider } from '../../functions/src/payments/fake';

if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
setProviderForTests(fakeProvider);

describe('rotina de expiração', () => {
  it('expira Pix vencido sem pagamento e libera o lote', async () => {
    const id = `exp-${Date.now()}`;
    await db.doc('parcels/rio-expir1').set({
      cityId: 'rio',
      basePrice: 1,
      area: 1,
      floors: 1,
      height: 3,
      sector: 'A1',
      orla: false,
      region: 'rio_8_8',
      purchasable: true,
      status: 'reserved',
      reservation: { orderId: id, uid: 'u', until: 1 },
    });
    await fakeProvider.createPix({
      orderId: id,
      amountCents: 100,
      description: 'x',
      payerEmail: null,
      payerName: 'U',
      expiresMinutes: 1,
    });
    await db.doc(`orders/${id}`).set({
      kind: 'primary',
      cityId: 'rio',
      parcelId: 'rio-expir1',
      buyerUid: 'u',
      status: 'pending_payment',
      expiresAt: 1000,
      payment: { provider: 'fake', providerOrderId: `FAKE-${id}`, amount: 100 },
      price: 100,
    });
    const r = await expireOrders(Date.now());
    expect(r.expired).toBeGreaterThanOrEqual(1);
    expect(((await db.doc(`orders/${id}`).get()).data() as OrderDoc).status).toBe('expired');
    const p = (await db.doc('parcels/rio-expir1').get()).data() as ParcelDoc;
    expect(p.status).toBe('available');
  });
});
