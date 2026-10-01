import type { CallableRequest } from 'firebase-functions/https';
import { fail } from './errors';

export interface Caller {
  uid: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  google: boolean;
  admin: boolean;
}

export function requireCaller(request: CallableRequest): Caller {
  const auth = request.auth;
  if (!auth) fail('unauthenticated', 'Entre na sua conta para continuar.');
  const t = auth.token;
  return {
    uid: auth.uid,
    name: String(t.name ?? t.email ?? 'Motorista').slice(0, 40),
    email: (t.email as string | undefined) ?? null,
    emailVerified: t.email_verified === true,
    google: t.firebase?.sign_in_provider === 'google.com',
    admin: t.admin === true,
  };
}

export function requireAdmin(request: CallableRequest): Caller {
  const c = requireCaller(request);
  if (!c.admin) fail('permission-denied', 'Apenas administradores.');
  return c;
}
