import { setGlobalOptions } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/firestore';
import { onCall, onRequest } from 'firebase-functions/https';
import { onSchedule } from 'firebase-functions/scheduler';
import type { ParcelDoc } from '@drivemart/shared';
import * as admin from './admin';
import { MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET } from './config';
import { devSimulatePayment as simulate } from './dev';
import { requireAdmin, requireCaller } from './lib/auth';
import { cancelOrder as cancel } from './orders/cancel';
import { expireOrders } from './orders/expire';
import * as customize from './parcels/customize';
import * as sale from './parcels/sale';
import { createPrimaryOrder as createPrimary } from './orders/primary';
import * as resale from './orders/resale';
import { syncParcelState } from './triggers/parcelState';
import { handleMercadoPagoWebhook } from './webhooks/mercadopago';

setGlobalOptions({ region: 'southamerica-east1', maxInstances: 10 });

/** Exige App Check nas callables quando ENFORCE_APP_CHECK=true (functions/.env). */
const enforceAppCheck = process.env.ENFORCE_APP_CHECK === 'true';
const callable = { enforceAppCheck, secrets: [MP_ACCESS_TOKEN] };

export const createPrimaryOrder = onCall(callable, (req) =>
  createPrimary(requireCaller(req), (req.data as { parcelId: string }).parcelId),
);

export const cancelOrder = onCall(callable, (req) =>
  cancel(requireCaller(req), (req.data as { orderId: string }).orderId),
);

export const updateParcelInfo = onCall({ enforceAppCheck }, (req) =>
  customize.updateParcelInfo(
    requireCaller(req),
    req.data as Parameters<typeof customize.updateParcelInfo>[1],
  ),
);

export const setParcelFacade = onCall({ enforceAppCheck, memory: '1GiB', timeoutSeconds: 120 }, (req) =>
  customize.setParcelFacade(requireCaller(req), req.data as customize.FacadeInput),
);

export const updateFacadeOptions = onCall({ enforceAppCheck }, (req) =>
  customize.updateFacadeOptions(
    requireCaller(req),
    req.data as Parameters<typeof customize.updateFacadeOptions>[1],
  ),
);

export const removeParcelFacade = onCall({ enforceAppCheck }, (req) =>
  customize.removeParcelFacade(requireCaller(req), (req.data as { parcelId: string }).parcelId),
);

export const listParcelForSale = onCall({ enforceAppCheck }, (req) =>
  sale.listParcelForSale(requireCaller(req), req.data as sale.ListInput),
);

export const unlistParcel = onCall({ enforceAppCheck }, (req) =>
  sale.unlistParcel(requireCaller(req), (req.data as { parcelId: string }).parcelId),
);

export const startResaleOrder = onCall(callable, (req) =>
  resale.startResaleOrder(requireCaller(req), (req.data as { parcelId: string }).parcelId),
);

export const markResalePaid = onCall({ enforceAppCheck }, (req) => {
  const d = req.data as { orderId: string; receiptPath?: string };
  return resale.markResalePaid(requireCaller(req), d.orderId, d.receiptPath);
});

export const confirmResaleReceipt = onCall({ enforceAppCheck }, (req) =>
  resale.confirmResaleReceipt(requireCaller(req), (req.data as { orderId: string }).orderId),
);

export const rejectResaleReceipt = onCall({ enforceAppCheck }, (req) => {
  const d = req.data as { orderId: string; reason?: string };
  return resale.rejectResaleReceipt(requireCaller(req), d.orderId, d.reason ?? '');
});

export const adminResolveDispute = onCall(callable, (req) =>
  admin.resolveDispute(requireAdmin(req), req.data as admin.DisputeInput),
);

export const adminModerateParcel = onCall({ enforceAppCheck }, (req) =>
  admin.moderateParcel(requireAdmin(req), req.data as Parameters<typeof admin.moderateParcel>[1]),
);

export const adminResolveReport = onCall({ enforceAppCheck }, (req) =>
  admin.resolveReport(requireAdmin(req), req.data as Parameters<typeof admin.resolveReport>[1]),
);

export const devSimulatePayment = onCall({ enforceAppCheck }, (req) =>
  simulate(requireCaller(req), (req.data as { orderId: string }).orderId),
);

export const mercadoPagoWebhook = onRequest(
  { secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('use POST');
      return;
    }
    try {
      const out = await handleMercadoPagoWebhook(req, MP_WEBHOOK_SECRET.value());
      res.status(out.status).send(out.body);
    } catch (err) {
      console.error('[webhook]', err);
      // 500 faz o Mercado Pago tentar de novo mais tarde.
      res.status(500).send('erro');
    }
  },
);

export const expireOrdersJob = onSchedule(
  { schedule: 'every 5 minutes', secrets: [MP_ACCESS_TOKEN] },
  async () => {
    const r = await expireOrders();
    if (r.expired || r.settled || r.stages) console.log('[expirar]', r);
  },
);

export const onParcelWritten = onDocumentWritten('parcels/{parcelId}', async (event) => {
  await syncParcelState(
    event.params.parcelId,
    event.data?.before.data() as ParcelDoc | undefined,
    event.data?.after.data() as ParcelDoc | undefined,
  );
});
