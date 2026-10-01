/**
 * Grava o catálogo de lotes de uma cidade no Firestore (emulador ou produção).
 * Só escreve campos de catálogo (preço base, área, setor...); nunca toca em dono, status ou personalização.
 *
 * Emulador:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run city:seed -- --city rio --project demo-drivemart
 * Produção:  GOOGLE_APPLICATION_CREDENTIALS=chave.json npm run city:seed -- --city rio --project <id>
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_PLATFORM, DEFAULT_PRICING, lotAnchor, regionKey, type CityLayout } from '@drivemart/shared';

const root = resolve(import.meta.dirname, '../../../..');
const { values } = parseArgs({
  options: {
    city: { type: 'string', default: 'rio' },
    project: { type: 'string', default: process.env.GCLOUD_PROJECT ?? 'demo-drivemart' },
  },
});

const layout = JSON.parse(
  readFileSync(join(root, 'packages/city-data', values.city!, 'layout.json'), 'utf8'),
) as CityLayout;

initializeApp({ projectId: values.project });
const db = getFirestore();
const writer = db.bulkWriter();
let count = 0;
for (const lot of layout.lots) {
  const [x, z] = lotAnchor(lot);
  writer.set(
    db.doc(`parcels/${lot.id}`),
    {
      cityId: layout.cityId,
      basePrice: lot.pr,
      area: lot.a,
      floors: lot.fl,
      height: lot.h,
      sector: lot.s,
      orla: lot.o === 1,
      region: regionKey(layout.cityId, x, z),
      purchasable: lot.z !== null,
    },
    { merge: true },
  );
  count++;
}
for (const [id, data] of [
  ['platform', DEFAULT_PLATFORM],
  ['pricing', { ...DEFAULT_PRICING, overrides: {} }],
] as const) {
  const ref = db.doc(`config/${id}`);
  if (!(await ref.get()).exists) writer.set(ref, data);
}
await writer.close();
console.log(
  `${count} lotes gravados em parcels/ (${values.project}${process.env.FIRESTORE_EMULATOR_HOST ? ', emulador' : ''}).`,
);
