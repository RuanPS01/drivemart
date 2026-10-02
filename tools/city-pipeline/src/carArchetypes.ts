import type { CarFace, CarKind, CarLivery, CarSlice, CarSpec } from '@drivemart/shared';
import { round2 } from './math';

/**
 * Carros de San Francisco (Driver 1). O pacote de níveis não traz os carros do primeiro jogo, então os
 * perfis seguem os tipos de carro americano dos anos 70 que aparecem nele: sedã grande, cupê esportivo,
 * perua, picape, van, táxi amarelo e viatura preta e branca.
 * Cada ponto: [z, base, cintura, teto, meia largura, meia largura da cabine], da frente (+z) para trás.
 */
type Key = [number, number, number, number, number, number];

interface Archetype {
  id: string;
  name: string;
  kind: CarKind;
  livery: CarLivery;
  face: CarFace;
  maxKmh: number;
  width: number;
  keys: Key[];
  axles: [number, number];
  radius: number;
  colors: [number, number, number][];
}

const PLAIN: [number, number, number][] = [
  [148, 32, 28],
  [38, 62, 112],
  [200, 188, 150],
  [64, 92, 58],
  [214, 214, 208],
  [28, 28, 30],
];

// Sedã grande: capô longo, cabine baixa, porta-malas reto.
const SEDAN: Key[] = [
  [2.7, 0.3, 0.76, 0.76, 0.94, 0.94],
  [2.45, 0.28, 0.85, 0.85, 0.99, 0.99],
  [1.15, 0.28, 0.92, 0.92, 0.99, 0.99],
  [0.5, 0.28, 0.95, 1.38, 0.99, 0.8],
  [-0.85, 0.28, 0.95, 1.4, 0.99, 0.8],
  [-1.45, 0.28, 0.96, 0.99, 0.99, 0.86],
  [-2.45, 0.28, 0.95, 0.95, 0.99, 0.99],
  [-2.7, 0.3, 0.9, 0.9, 0.95, 0.95],
];

const ARCHETYPES: Archetype[] = [
  {
    id: 'sf-coupe',
    name: 'Cupê esportivo',
    kind: 'coupe',
    livery: 'plain',
    face: 'seventies',
    maxKmh: 200,
    width: 1.9,
    keys: [
      [2.38, 0.26, 0.7, 0.7, 0.9, 0.9],
      [2.1, 0.24, 0.8, 0.8, 0.95, 0.95],
      [0.8, 0.24, 0.84, 0.84, 0.95, 0.95],
      [0.2, 0.24, 0.86, 1.27, 0.95, 0.74],
      [-0.55, 0.24, 0.86, 1.26, 0.95, 0.76],
      [-1.75, 0.24, 0.9, 0.95, 0.95, 0.88],
      [-2.38, 0.27, 0.88, 0.88, 0.92, 0.92],
    ],
    axles: [1.42, -1.38],
    radius: 0.34,
    colors: [[166, 34, 28], ...PLAIN],
  },
  {
    id: 'sf-sedan',
    name: 'Sedã grande',
    kind: 'sedan',
    livery: 'plain',
    face: 'seventies',
    maxKmh: 185,
    width: 1.98,
    keys: SEDAN,
    axles: [1.65, -1.45],
    radius: 0.33,
    colors: [[38, 62, 112], ...PLAIN],
  },
  {
    id: 'sf-wagon',
    name: 'Perua',
    kind: 'wagon',
    livery: 'woody',
    face: 'seventies',
    maxKmh: 175,
    width: 1.98,
    keys: [
      [2.75, 0.3, 0.76, 0.76, 0.94, 0.94],
      [2.5, 0.28, 0.85, 0.85, 0.99, 0.99],
      [1.2, 0.28, 0.92, 0.92, 0.99, 0.99],
      [0.55, 0.28, 0.95, 1.4, 0.99, 0.8],
      [-2.55, 0.28, 0.96, 1.42, 0.99, 0.84],
      [-2.75, 0.3, 0.92, 1.36, 0.96, 0.84],
    ],
    axles: [1.7, -1.5],
    radius: 0.33,
    colors: [[200, 188, 150], ...PLAIN],
  },
  {
    id: 'sf-pickup',
    name: 'Picape',
    kind: 'pickup',
    livery: 'plain',
    face: 'seventies',
    maxKmh: 165,
    width: 2.0,
    keys: [
      [2.65, 0.4, 0.92, 0.92, 0.96, 0.96],
      [2.35, 0.38, 1.04, 1.04, 1.0, 1.0],
      [1.0, 0.38, 1.08, 1.08, 1.0, 1.0],
      [0.55, 0.38, 1.1, 1.72, 1.0, 0.86],
      [-0.55, 0.38, 1.1, 1.74, 1.0, 0.88],
      [-0.65, 0.38, 1.06, 1.06, 1.0, 1.0],
      [-2.65, 0.4, 1.06, 1.06, 1.0, 1.0],
    ],
    axles: [1.62, -1.6],
    radius: 0.38,
    colors: [[64, 92, 58], ...PLAIN],
  },
  {
    id: 'sf-van',
    name: 'Van',
    kind: 'van',
    livery: 'plain',
    face: 'seventies',
    maxKmh: 150,
    width: 2.0,
    keys: [
      [2.45, 0.32, 0.92, 0.92, 0.96, 0.96],
      [2.1, 0.3, 1.04, 1.08, 1.0, 1.0],
      [1.65, 0.3, 1.1, 1.98, 1.0, 0.94],
      [-2.3, 0.3, 1.12, 2.0, 1.0, 0.96],
      [-2.45, 0.32, 1.1, 1.96, 0.98, 0.94],
    ],
    axles: [1.45, -1.55],
    radius: 0.36,
    colors: [[214, 214, 208], ...PLAIN],
  },
  {
    id: 'sf-taxi',
    name: 'Táxi amarelo',
    kind: 'taxi',
    livery: 'taxi-sf',
    face: 'seventies',
    maxKmh: 180,
    width: 1.98,
    keys: SEDAN,
    axles: [1.65, -1.45],
    radius: 0.33,
    colors: [[236, 186, 30]],
  },
  {
    id: 'sf-police',
    name: 'Viatura da polícia',
    kind: 'police',
    livery: 'police-sf',
    face: 'seventies',
    maxKmh: 200,
    width: 1.98,
    keys: SEDAN,
    axles: [1.65, -1.45],
    radius: 0.33,
    colors: [[26, 26, 28]],
  },
];

export function sfCars(): CarSpec[] {
  return ARCHETYPES.map((a) => {
    const slices: CarSlice[] = a.keys.map(([z, bottom, belt, roof, hw, rhw]) => ({
      z,
      bottom,
      belt,
      roof,
      halfWidth: hw,
      roofHalfWidth: rhw,
    }));
    const zs = slices.map((s) => s.z);
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      length: round2(Math.max(...zs) - Math.min(...zs)),
      width: a.width,
      height: Math.max(...slices.map((s) => s.roof)),
      slices,
      wheels: { radius: a.radius, axles: a.axles, track: round2((a.width / 2) * 0.86) },
      colors: a.colors,
      livery: a.livery,
      face: a.face,
      maxKmh: a.maxKmh,
    };
  });
}
