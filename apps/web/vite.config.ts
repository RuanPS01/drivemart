import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const cityDataDir = resolve(__dirname, '../../packages/city-data');

/** Serve `packages/city-data` em /cities durante o dev e copia para dist/cities no build. */
function cityData(): Plugin {
  return {
    name: 'drivemart-city-data',
    configureServer(server) {
      server.middlewares.use('/cities', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(/^([/\\])+/, '');
        const file = join(cityDataDir, rel);
        if (!file.startsWith(cityDataDir) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader(
          'Content-Type',
          file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        );
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const out = options.dir ?? resolve(__dirname, 'dist');
      cpSync(cityDataDir, join(out, 'cities'), {
        recursive: true,
        filter: (src) => !src.endsWith('package.json') && !src.endsWith('ids.lock.json'),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cityData()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
});
