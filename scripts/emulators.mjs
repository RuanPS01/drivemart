// Sobe os emuladores do Firebase com o projeto de demonstração.
// Reaproveita os dados salvos em .emulator-data (se houver) e salva de novo ao sair.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = [
  'firebase',
  'emulators:start',
  '--project',
  'demo-drivemart',
  '--export-on-exit',
  '.emulator-data',
];
if (existsSync('.emulator-data/firebase-export-metadata.json')) args.push('--import', '.emulator-data');

const child = spawn('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
