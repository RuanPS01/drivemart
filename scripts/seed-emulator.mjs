// Grava o catálogo de lotes do Rio no emulador do Firestore (rode com os emuladores no ar).
import { spawnSync } from 'node:child_process';

const r = spawnSync('npm', ['run', 'city:seed', '--', '--city', 'rio', '--project', 'demo-drivemart'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080' },
});
process.exit(r.status ?? 1);
