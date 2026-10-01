/**
 * Extrai o traçado de uma cidade a partir do arquivo .7z com os níveis em VRML.
 * Uso: npm run city:extract -- --archive <arquivo.7z> --city rio [--debug <saida.png>] [--scale 0.5]
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sevenZip from '7zip-bin';
import { renderDebugPng } from '../debugPng';
import { CITIES, runPipeline } from '../pipeline';

const root = resolve(import.meta.dirname, '../../../..');
const { values } = parseArgs({
  options: {
    archive: { type: 'string' },
    city: { type: 'string', default: 'rio' },
    debug: { type: 'string' },
    scale: { type: 'string', default: '0.5' },
    crop: { type: 'string' },
  },
});

const cfg = CITIES[values.city!];
if (!cfg)
  throw new Error(`Cidade desconhecida: ${values.city}. Disponíveis: ${Object.keys(CITIES).join(', ')}`);

const rawDir = join(root, '.cache/raw');
const levelDir = join(rawDir, cfg.archiveFolder);
if (!existsSync(join(levelDir, 'level.wrl'))) {
  if (!values.archive)
    throw new Error('Informe --archive <arquivo.7z> (o nível ainda não foi extraído em .cache/raw).');
  mkdirSync(rawDir, { recursive: true });
  chmodSync(sevenZip.path7za, 0o755);
  console.log(`Extraindo "${cfg.archiveFolder}" de ${values.archive}...`);
  execFileSync(
    sevenZip.path7za,
    ['x', '-y', `-o${rawDir}`, resolve(values.archive), `${cfg.archiveFolder}/*`],
    {
      stdio: 'ignore',
    },
  );
}

const outDir = join(root, 'packages/city-data', cfg.cityId);
mkdirSync(outDir, { recursive: true });
const result = runPipeline(levelDir, cfg, join(outDir, 'ids.lock.json'));
const json = JSON.stringify(result.layout);
writeFileSync(join(outDir, 'layout.json'), json);
console.table(result.report);
console.log(`layout.json: ${(json.length / 1024 / 1024).toFixed(2)} MB em ${outDir}`);
if (values.debug) {
  const crop = values.crop
    ? (values.crop.split(',').map(Number) as [number, number, number, number])
    : undefined;
  renderDebugPng(result.layout, resolve(values.debug), Number(values.scale), crop);
  console.log(`Imagem de conferência: ${values.debug}`);
}
