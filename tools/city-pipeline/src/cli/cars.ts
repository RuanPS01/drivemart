/**
 * Gera o catálogo de carros de uma cidade (packages/city-data/<cidade>/cars.json).
 * Rio: mede os carros do nível de Driver 2 (precisa do nível extraído em .cache/raw, veja city:extract).
 * San Francisco: perfis próprios de carros americanos dos anos 70 (o pacote não traz os carros do Driver 1).
 * Uso: npm run city:cars -- --city rio
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { CarCatalog, CarSpec } from '@drivemart/shared';
import { sfCars } from '../carArchetypes';
import { measureCar, type CarMeta } from '../cars';
import { CITIES } from '../pipeline';
import { buildModel } from '../scene';
import { isNode, parseVrml, type VrmlNode } from '../vrml/parser';
import { TriangleColors } from '../world';

const root = resolve(import.meta.dirname, '../../../..');
const { values } = parseArgs({ options: { city: { type: 'string', default: 'rio' } } });
const city = values.city!;

const CLASSIC: [number, number, number][] = [
  [196, 44, 36],
  [44, 74, 138],
  [226, 222, 204],
  [74, 108, 70],
  [30, 30, 32],
];

/** Carros do Rio (Driver 2), na ordem dos arquivos "car N.wrl". */
const RIO_META: CarMeta[] = [
  {
    name: 'Viatura da polícia',
    kind: 'police',
    livery: 'police-rio',
    face: 'classic',
    maxKmh: 185,
    color: [32, 32, 34],
  },
  { name: 'Sedã creme', kind: 'sedan', livery: 'plain', face: 'classic', maxKmh: 175, extraColors: CLASSIC },
  {
    name: 'Rabo de peixe',
    kind: 'sedan',
    livery: 'plain',
    face: 'classic',
    maxKmh: 185,
    extraColors: CLASSIC,
  },
  {
    name: 'Sedã vermelho',
    kind: 'sedan',
    livery: 'plain',
    face: 'classic',
    maxKmh: 180,
    color: [178, 38, 30],
    extraColors: CLASSIC,
  },
  {
    name: 'Sedã amarelo',
    kind: 'sedan',
    livery: 'plain',
    face: 'classic',
    maxKmh: 175,
    color: [222, 180, 44],
    extraColors: CLASSIC,
  },
  { name: 'Ônibus', kind: 'bus', livery: 'bus', face: 'bus', maxKmh: 110, color: [48, 74, 132] },
  {
    name: 'Picape preta',
    kind: 'pickup',
    livery: 'plain',
    face: 'classic',
    maxKmh: 180,
    extraColors: CLASSIC,
  },
  {
    name: 'Caminhão de bombeiros',
    kind: 'fire',
    livery: 'fire',
    face: 'truck',
    maxKmh: 130,
    color: [196, 32, 26],
  },
  {
    name: 'Limusine preta',
    kind: 'limo',
    livery: 'plain',
    face: 'classic',
    maxKmh: 170,
    color: [30, 30, 34],
  },
  {
    name: 'Caminhonete azul',
    kind: 'truck',
    livery: 'rust',
    face: 'truck',
    maxKmh: 130,
    color: [58, 92, 148],
  },
];

let cars: CarSpec[];
let source: string;
if (city === 'rio') {
  const dir = join(root, '.cache/raw', CITIES.rio!.archiveFolder);
  const colors = new TriangleColors(dir);
  cars = RIO_META.map((meta, k) => {
    const doc = parseVrml(readFileSync(join(dir, `car ${k}.wrl`), 'latin1'));
    const group = doc.root.find((n): n is VrmlNode => isNode(n));
    if (!group) throw new Error(`car ${k}.wrl sem geometria`);
    const model = buildModel(doc, group, `car ${k}`, CITIES.rio!.unitsPerMeter);
    if (!model) throw new Error(`car ${k}.wrl sem geometria`);
    return measureCar(model, colors, `rio-${k}`, meta);
  });
  // Primeiro da lista: o carro com que o jogo começa.
  const first = cars.findIndex((c) => c.id === 'rio-3');
  cars.unshift(...cars.splice(first, 1));
  source = 'Proporções medidas nos carros do nível de Driver 2 (Rio). Malha e texturas feitas por código.';
} else if (city === 'sf') {
  cars = sfCars();
  source = 'Perfis próprios de carros americanos dos anos 70, como os do Driver (San Francisco).';
} else {
  throw new Error(`Cidade sem carros: ${city}`);
}

const catalog: CarCatalog = { cityId: city, source, cars };
const out = join(root, 'packages/city-data', city, 'cars.json');
writeFileSync(out, JSON.stringify(catalog));
for (const c of cars)
  console.log(
    c.id.padEnd(10),
    c.name.padEnd(24),
    `${c.length} x ${c.width} x ${c.height} m`,
    'eixos',
    c.wheels.axles.join(' '),
    'cor',
    c.colors[0]!.join(','),
  );
console.log(`${cars.length} carros em ${out}`);
