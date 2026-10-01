// Cria functions/.secret.local com valores de teste para o emulador, se ainda não existir.
import { existsSync, writeFileSync } from 'node:fs';

const path = new URL('../functions/.secret.local', import.meta.url);
if (!existsSync(path)) {
  writeFileSync(path, 'MP_ACCESS_TOKEN=TEST-emulador\nMP_WEBHOOK_SECRET=segredo-emulador\n');
  console.log('functions/.secret.local criado com valores de teste para o emulador.');
}
