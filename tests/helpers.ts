/** Utilidades para testes contra os emuladores (rodam dentro de `firebase emulators:exec`). */
export const PROJECT = 'demo-drivemart';
export const REGION = 'southamerica-east1';

process.env.GCLOUD_PROJECT ??= PROJECT;

const authHost = () => process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const functionsHost = () => process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';

export interface TestUser {
  uid: string;
  idToken: string;
  email: string;
}

/** Cria um usuário no emulador de Auth e devolve o ID token. */
export async function createUser(name: string, verified = false): Promise<TestUser> {
  const email = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@teste.com`;
  const res = await fetch(`http://${authHost()}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'segredo123', displayName: name, returnSecureToken: true }),
  });
  const data = (await res.json()) as { localId: string; idToken: string };
  let idToken = data.idToken;
  if (verified) {
    await fetch(`http://${authHost()}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: data.localId, emailVerified: true, displayName: name }),
    });
    idToken = await signIn(email);
  }
  return { uid: data.localId, idToken, email };
}

export async function signIn(email: string): Promise<string> {
  const res = await fetch(
    `http://${authHost()}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'segredo123', returnSecureToken: true }),
    },
  );
  return ((await res.json()) as { idToken: string }).idToken;
}

export interface CallResult<T> {
  ok: boolean;
  data?: T;
  error?: { status: string; message: string };
}

/** Chama uma função callable no emulador. */
export async function call<T>(name: string, data: unknown, user?: TestUser): Promise<CallResult<T>> {
  const res = await fetch(`http://${functionsHost()}/${PROJECT}/${REGION}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${user.idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const json = (await res.json()) as { result?: T; error?: { status: string; message: string } };
  return json.error ? { ok: false, error: json.error } : { ok: true, data: json.result };
}

/** Espera uma condição assíncrona (triggers do emulador). */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  timeout = 10000,
): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('tempo esgotado esperando condição');
    await new Promise((r) => setTimeout(r, 250));
  }
}
