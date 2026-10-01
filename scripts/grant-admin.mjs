/**
 * Concede (ou remove) o acesso de administrador a uma conta pelo e-mail (custom claim `admin`).
 * A pessoa precisa sair e entrar de novo para o acesso valer.
 *
 * Produção:  GOOGLE_APPLICATION_CREDENTIALS=chave.json node scripts/grant-admin.mjs voce@exemplo.com --project <id>
 * Emulador:  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/grant-admin.mjs voce@exemplo.com
 * Remover:   acrescente --revoke
 */
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: 'string', default: process.env.GCLOUD_PROJECT ?? 'demo-drivemart' },
    revoke: { type: 'boolean', default: false },
  },
});

const email = positionals[0];
if (!email) {
  console.error('Uso: node scripts/grant-admin.mjs <email> [--project <id>] [--revoke]');
  process.exit(1);
}

initializeApp({ projectId: values.project });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const claims = { ...(user.customClaims ?? {}) };
if (values.revoke) delete claims.admin;
else claims.admin = true;
await auth.setCustomUserClaims(user.uid, claims);
console.log(
  `${values.revoke ? 'Acesso de admin removido de' : 'Acesso de admin concedido a'} ${email} (${user.uid}) no projeto ${values.project}.`,
);
