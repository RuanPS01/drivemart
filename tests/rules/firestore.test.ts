import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { PROJECT } from '../helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: `${PROJECT}-rules`,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'parcels/rio-aaaaaa'), { cityId: 'rio', status: 'owned', ownerUid: 'dono' });
    await setDoc(doc(db, 'parcels/rio-aaaaaa/private/sale'), { pixKey: '52998224725' });
    await setDoc(doc(db, 'cityState/rio_0_0'), { parcels: {} });
    await setDoc(doc(db, 'orders/o1'), {
      buyerUid: 'comprador',
      sellerUid: 'dono',
      status: 'pending_payment',
    });
    await setDoc(doc(db, 'config/platform'), { resaleFeeBps: 1000 });
  });
});

describe('regras do Firestore', () => {
  it('estado público pode ser lido por todos e escrito por ninguém', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, 'cityState/rio_0_0')));
    await assertSucceeds(getDoc(doc(anon, 'parcels/rio-aaaaaa')));
    await assertSucceeds(getDoc(doc(anon, 'config/platform')));
    const user = env.authenticatedContext('qualquer').firestore();
    await assertFails(setDoc(doc(user, 'cityState/rio_0_0'), { parcels: { x: { s: 'owned' } } }));
    await assertFails(updateDoc(doc(user, 'parcels/rio-aaaaaa'), { ownerUid: 'qualquer' }));
    await assertFails(setDoc(doc(user, 'config/platform'), { resaleFeeBps: 0 }));
  });

  it('chave Pix só é lida pelo dono', async () => {
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('dono').firestore(), 'parcels/rio-aaaaaa/private/sale')),
    );
    await assertFails(
      getDoc(doc(env.authenticatedContext('outro').firestore(), 'parcels/rio-aaaaaa/private/sale')),
    );
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'parcels/rio-aaaaaa/private/sale')),
    );
  });

  it('pedido só é lido pelo comprador, pelo vendedor e pelo admin', async () => {
    await assertSucceeds(getDoc(doc(env.authenticatedContext('comprador').firestore(), 'orders/o1')));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('dono').firestore(), 'orders/o1')));
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('chefe', { admin: true }).firestore(), 'orders/o1')),
    );
    await assertFails(getDoc(doc(env.authenticatedContext('curioso').firestore(), 'orders/o1')));
    await assertFails(
      setDoc(doc(env.authenticatedContext('comprador').firestore(), 'orders/o2'), { buyerUid: 'comprador' }),
    );
  });

  it('perfil público: cada um escreve só o seu, com campos limitados', async () => {
    const me = env.authenticatedContext('eu').firestore();
    await assertSucceeds(setDoc(doc(me, 'users/eu'), { displayName: 'Eu', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(me, 'users/outro'), { displayName: 'Hack' }));
    await assertFails(setDoc(doc(me, 'users/eu'), { displayName: 'Eu', admin: true }));
    await assertFails(setDoc(doc(me, 'users/eu'), { displayName: 'x'.repeat(41) }));
  });

  it('denúncias: qualquer usuário cria, só admin lê', async () => {
    const u = env.authenticatedContext('denunciante').firestore();
    await assertSucceeds(
      setDoc(doc(u, 'reports/r1'), {
        parcelId: 'rio-aaaaaa',
        reporterUid: 'denunciante',
        reason: 'ofensivo',
        status: 'open',
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(u, 'reports/r2'), {
        parcelId: 'rio-aaaaaa',
        reporterUid: 'outro',
        reason: 'ofensivo',
        status: 'open',
      }),
    );
    await assertFails(
      setDoc(doc(u, 'reports/r3'), {
        parcelId: 'rio-aaaaaa',
        reporterUid: 'denunciante',
        reason: 'qualquer',
        status: 'open',
      }),
    );
    await assertFails(getDoc(doc(u, 'reports/r1')));
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext('chefe', { admin: true }).firestore(), 'reports/r1')),
    );
  });
});
