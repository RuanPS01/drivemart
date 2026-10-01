import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseBrCode, type OrderDoc, type ParcelDoc } from '@drivemart/shared';
import { expireOrders } from '../../functions/src/orders/expire';
import { setProviderForTests } from '../../functions/src/payments';
import { fakeProvider } from '../../functions/src/payments/fake';
import { call, createUser, makeAdmin, PROJECT, type TestUser } from '../helpers';

if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
setProviderForTests(fakeProvider);

// CPF válido de teste (gerado para testes, sem titular real).
const CPF = '529.982.247-25';

async function seedOwned(id: string, owner: TestUser): Promise<void> {
  await db.doc(`parcels/${id}`).set({
    cityId: 'rio',
    basePrice: 24000,
    area: 77,
    floors: 3,
    height: 9.4,
    sector: 'D1',
    orla: false,
    region: 'rio_9_9',
    purchasable: true,
    status: 'owned',
    ownerUid: owner.uid,
    ownerName: 'Vendedora',
    displayName: 'Loja da Vendedora',
    linkUrl: 'https://exemplo.com.br/',
  } satisfies ParcelDoc);
}

const listing = (parcelId: string, price = 150000) => ({
  parcelId,
  price,
  pixKeyType: 'cpf',
  pixKey: CPF,
  receiverName: 'Maria Vendedora',
  receiverCity: 'Rio de Janeiro',
});

const parcel = async (id: string) => (await db.doc(`parcels/${id}`).get()).data() as ParcelDoc;
const order = async (id: string) => (await db.doc(`orders/${id}`).get()).data() as OrderDoc;

/** Coloca à venda, inicia a compra e paga a taxa. Devolve o id do pedido. */
async function upToFeePaid(id: string, seller: TestUser, buyer: TestUser): Promise<string> {
  await seedOwned(id, seller);
  expect((await call('listParcelForSale', listing(id), seller)).ok).toBe(true);
  const r = await call<{ orderId: string }>('startResaleOrder', { parcelId: id }, buyer);
  expect(r.ok).toBe(true);
  const orderId = r.data!.orderId;
  expect((await call<{ result: string }>('devSimulatePayment', { orderId }, buyer)).data?.result).toBe(
    'fee_paid',
  );
  return orderId;
}

describe('revenda com dois Pix e confirmação do vendedor', () => {
  let seller: TestUser;
  let buyer: TestUser;
  let other: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    seller = await createUser('Vendedora', true);
    buyer = await createUser('Comprador', true);
    other = await createUser('Curioso', true);
    admin = await makeAdmin(await createUser('Admin', true));
  });

  it('só o dono anuncia, com preço e chave Pix válidos', async () => {
    await seedOwned('rio-rsl001', seller);
    expect((await call('listParcelForSale', listing('rio-rsl001'), other)).error?.status).toBe(
      'PERMISSION_DENIED',
    );
    const badKey = { ...listing('rio-rsl001'), pixKey: '111.111.111-11' };
    expect((await call('listParcelForSale', badKey, seller)).error?.status).toBe('INVALID_ARGUMENT');
    expect((await call('listParcelForSale', listing('rio-rsl001', 50), seller)).error?.status).toBe(
      'INVALID_ARGUMENT',
    );

    const ok = await call<{ fee: number; seller: number }>(
      'listParcelForSale',
      listing('rio-rsl001'),
      seller,
    );
    expect(ok.data).toEqual({ fee: 15000, seller: 135000 });
    const p = await parcel('rio-rsl001');
    expect(p.status).toBe('for_sale');
    expect(p.salePrice).toBe(150000);
    const priv = (await db.doc('parcels/rio-rsl001/private/sale').get()).data()!;
    expect(priv.pixKey).toBe('52998224725');
    expect(priv.receiverName).toBe('Maria Vendedora');

    expect((await call('unlistParcel', { parcelId: 'rio-rsl001' }, seller)).ok).toBe(true);
    expect((await parcel('rio-rsl001')).status).toBe('owned');
    expect((await db.doc('parcels/rio-rsl001/private/sale').get()).exists).toBe(false);
  });

  it('fluxo completo: taxa, QR do vendedor, "já paguei" e confirmação', async () => {
    const id = 'rio-rsl002';
    await seedOwned(id, seller);
    await call('listParcelForSale', listing(id), seller);
    expect((await call('startResaleOrder', { parcelId: id }, seller)).error?.status).toBe(
      'FAILED_PRECONDITION',
    );

    const r = await call<{ orderId: string; fee: number; sellerAmount: number; qrCode: string }>(
      'startResaleOrder',
      { parcelId: id },
      buyer,
    );
    expect(r.ok).toBe(true);
    const { orderId } = r.data!;
    expect(r.data!.fee).toBe(15000);
    expect(r.data!.sellerAmount).toBe(135000);
    expect(parseBrCode(r.data!.qrCode)['54']).toBe('150.00');

    let o = await order(orderId);
    expect(o.kind).toBe('resale');
    expect(o.resale?.brCode).toBe('');
    expect(o.resale?.pixKeyMasked).toBe('529***725');
    expect((await parcel(id)).status).toBe('reserved');

    // Reservado: ninguém mais compra e o vendedor não retira nem muda o anúncio.
    expect((await call('startResaleOrder', { parcelId: id }, other)).error?.status).toBe(
      'FAILED_PRECONDITION',
    );
    expect((await call('unlistParcel', { parcelId: id }, seller)).error?.status).toBe('FAILED_PRECONDITION');
    expect((await call('listParcelForSale', listing(id, 999900), seller)).error?.status).toBe(
      'FAILED_PRECONDITION',
    );
    // "Já paguei" antes da taxa não vale.
    expect((await call('markResalePaid', { orderId }, buyer)).error?.status).toBe('FAILED_PRECONDITION');

    await call('devSimulatePayment', { orderId }, buyer);
    o = await order(orderId);
    expect(o.status).toBe('fee_paid');
    const br = parseBrCode(o.resale!.brCode);
    expect(br['54']).toBe('1350.00');
    expect(br['59']).toBe('Maria Vendedora');
    expect(br['26']).toContain('52998224725');

    expect((await call('markResalePaid', { orderId }, other)).error?.status).toBe('PERMISSION_DENIED');
    expect(
      (await call('markResalePaid', { orderId, receiptPath: 'receipts/outro/x.png' }, buyer)).error?.status,
    ).toBe('INVALID_ARGUMENT');
    expect(
      (await call('markResalePaid', { orderId, receiptPath: `receipts/${orderId}/c.png` }, buyer)).ok,
    ).toBe(true);
    o = await order(orderId);
    expect(o.status).toBe('buyer_marked_paid');
    expect(o.resale?.receiptPath).toBe(`receipts/${orderId}/c.png`);

    expect((await call('confirmResaleReceipt', { orderId }, buyer)).error?.status).toBe('PERMISSION_DENIED');
    expect((await call('confirmResaleReceipt', { orderId }, seller)).ok).toBe(true);
    expect((await order(orderId)).status).toBe('completed');

    const p = await parcel(id);
    expect(p.status).toBe('owned');
    expect(p.ownerUid).toBe(buyer.uid);
    expect(p.displayName).toBeNull();
    expect(p.linkUrl).toBeNull();
    expect(p.reservation).toBeUndefined();
    expect((await db.doc(`parcels/${id}/private/sale`).get()).exists).toBe(false);
    expect((await db.doc(`parcels/${id}/history/${orderId}`).get()).data()?.fromUid).toBe(seller.uid);
  });

  it('vendedor recusa: vira disputa e o admin anula devolvendo a taxa', async () => {
    const id = 'rio-rsl003';
    const orderId = await upToFeePaid(id, seller, buyer);
    await call('markResalePaid', { orderId }, buyer);
    expect((await call('rejectResaleReceipt', { orderId, reason: 'Nada caiu' }, seller)).ok).toBe(true);
    expect((await order(orderId)).status).toBe('disputed');

    // Só admin decide.
    const asSeller = await call('adminResolveDispute', { orderId, outcome: 'cancel' }, seller);
    expect(asSeller.error?.status).toBe('PERMISSION_DENIED');

    const r = await call('adminResolveDispute', { orderId, outcome: 'cancel', refundFee: true }, admin);
    expect(r.ok).toBe(true);
    const o = await order(orderId);
    expect(o.status).toBe('canceled');
    expect(o.refund?.status).toBe('done');
    expect(o.resolution?.outcome).toBe('cancel');
    const p = await parcel(id);
    expect(p.status).toBe('for_sale');
    expect(p.ownerUid).toBe(seller.uid);
  });

  it('admin conclui a disputa a favor do comprador', async () => {
    const id = 'rio-rsl004';
    const orderId = await upToFeePaid(id, seller, buyer);
    await call('markResalePaid', { orderId }, buyer);
    await call('rejectResaleReceipt', { orderId }, seller);
    expect((await call('adminResolveDispute', { orderId, outcome: 'complete' }, admin)).ok).toBe(true);
    expect((await order(orderId)).status).toBe('completed');
    expect((await parcel(id)).ownerUid).toBe(buyer.uid);
  });

  it('comprador desiste depois da taxa: devolução e imóvel volta à venda', async () => {
    const id = 'rio-rsl005';
    const orderId = await upToFeePaid(id, seller, buyer);
    expect((await call('cancelOrder', { orderId }, buyer)).ok).toBe(true);
    const o = await order(orderId);
    expect(o.status).toBe('canceled');
    expect(o.refund?.status).toBe('done');
    expect((await parcel(id)).status).toBe('for_sale');
  });

  it('prazos: sem "já paguei" expira com devolução; sem confirmação vira disputa', async () => {
    const a = await upToFeePaid('rio-rsl006', seller, buyer);
    const b = await upToFeePaid('rio-rsl007', seller, other);
    await call('markResalePaid', { orderId: b }, other);
    const future = Date.now() + 200 * 3_600_000;
    await expireOrders(future);
    const oa = await order(a);
    expect(oa.status).toBe('expired');
    expect(oa.refund?.status).toBe('done');
    expect((await parcel('rio-rsl006')).status).toBe('for_sale');
    expect((await order(b)).status).toBe('disputed');
    expect((await parcel('rio-rsl007')).status).toBe('reserved');
  });

  it('denúncia: admin bloqueia a fachada e remove o link', async () => {
    const id = 'rio-rsl008';
    await seedOwned(id, seller);
    await db.doc(`parcels/${id}`).update({
      facade: {
        path: 'facades/x/published/a.webp',
        url: 'https://exemplo.com.br/a.webp',
        kind: 'image',
        fit: 'cover',
        region: 'full',
        ps1: false,
        background: '#000000',
        width: 10,
        height: 10,
        moderation: 'ok',
        updatedAt: 1,
      },
    });
    const rep = await db.collection('reports').add({
      parcelId: id,
      reporterUid: other.uid,
      reason: 'golpe',
      status: 'open',
      createdAt: Date.now(),
    });
    expect(
      (await call('adminResolveReport', { reportId: rep.id, action: 'block' }, other)).error?.status,
    ).toBe('PERMISSION_DENIED');
    expect((await call('adminResolveReport', { reportId: rep.id, action: 'block' }, admin)).ok).toBe(true);
    const p = await parcel(id);
    expect(p.facade?.moderation).toBe('blocked');
    expect(p.linkUrl).toBeNull();
    expect((await rep.get()).data()?.status).toBe('actioned');
  });
});
