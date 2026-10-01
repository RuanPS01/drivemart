import * as G from './painters/ground';
import * as B from './painters/buildings';
import * as O from './painters/objects';
import type { Px } from './pixels';

export const LAYER_SIZE = 128;

/**
 * Camadas do array de texturas. A ordem é o índice usado nos vértices (atributo `layer`).
 * Para trocar uma camada por arte feita à mão, basta gerar um PNG 128 x 128 com o mesmo nome
 * (veja `loadOverrides`).
 */
const PAINTERS = {
  asphalt: G.asphalt,
  sidewalk: G.sidewalk,
  calcadao: G.calcadao,
  plaza: G.plaza,
  curb: G.curb,
  grass: G.grass,
  sand: G.sand,
  dirt: G.dirt,
  water: G.water,
  rock: G.rock,
  forest: G.forest,
  marking: G.marking,
  markingYellow: G.markingYellow,
  crosswalk: G.crosswalk,
  concrete: G.concrete,
  facadeConcrete: B.facadeConcrete,
  facadeBrick: B.facadeBrick,
  facadeTile: B.facadeTile,
  facadeGlass: B.facadeGlass,
  facadeColonial: B.facadeColonial,
  facadeModern: B.facadeModern,
  facadeConcrete2: (s: number) => B.facadeConcrete(s + 7),
  facadeTile2: (s: number) => B.facadeTile(s + 7),
  facadeSide: B.facadeSide,
  roof: B.roof,
  shopGlass: B.shopGlass,
  shopGlass2: (s: number) => B.shopGlass(s + 11),
  shopAwning: B.shopAwning,
  shopAwning2: (s: number) => B.shopAwning(s + 5),
  shopShutter: B.shopShutter,
  shopLobby: B.shopLobby,
  metal: O.metal,
  lamp: O.lamp,
  trafficLight: O.trafficLight,
  cone: O.coneStripes,
  barrier: O.barrierStripes,
  wood: O.wood,
  canvas: O.canvasStripes,
  canvas2: (s: number) => O.canvasStripes(s + 3),
  plastic: O.plasticGreen,
  palm: O.palm,
  tree: O.tree,
  bush: O.bush,
  carPaint: O.carPaint,
  carGlass: O.carGlass,
  carFront: O.carFront,
  carRear: O.carRear,
  wheel: O.wheel,
  tread: O.tread,
} satisfies Record<string, (seed: number) => Px>;

export type LayerName = keyof typeof PAINTERS;
export const LAYER_NAMES = Object.keys(PAINTERS) as LayerName[];
export const LAYER: Record<LayerName, number> = Object.fromEntries(
  LAYER_NAMES.map((n, i) => [n, i]),
) as Record<LayerName, number>;

export const FACADE_FAMILIES: LayerName[] = [
  'facadeConcrete',
  'facadeBrick',
  'facadeTile',
  'facadeGlass',
  'facadeColonial',
  'facadeModern',
  'facadeConcrete2',
  'facadeTile2',
];
export const SHOP_LAYERS: LayerName[] = [
  'shopGlass',
  'shopGlass2',
  'shopAwning',
  'shopAwning2',
  'shopShutter',
  'shopLobby',
];

/** Pinta todas as camadas num único buffer RGBA (camadas empilhadas). */
export function paintLayers(seed = 1999): Uint8Array {
  const size = LAYER_SIZE * LAYER_SIZE * 4;
  const out = new Uint8Array(size * LAYER_NAMES.length);
  LAYER_NAMES.forEach((name, i) => {
    const px = PAINTERS[name](seed + i * 101);
    px.toBytes(out, i * size);
  });
  return out;
}

/** Substitui camadas por PNGs feitos à mão em `/art/<camada>.png`, se existirem (lista em `/art/overrides.json`). */
export async function loadOverrides(data: Uint8Array): Promise<number> {
  let names: string[];
  try {
    const res = await fetch('/art/overrides.json');
    if (!res.ok) return 0;
    names = (await res.json()) as string[];
  } catch {
    return 0;
  }
  const size = LAYER_SIZE * LAYER_SIZE * 4;
  let applied = 0;
  for (const name of names) {
    const idx = LAYER_NAMES.indexOf(name as LayerName);
    if (idx < 0) continue;
    const img = await createImageBitmap(await (await fetch(`/art/${name}.png`)).blob());
    const canvas = new OffscreenCanvas(LAYER_SIZE, LAYER_SIZE);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, LAYER_SIZE, LAYER_SIZE);
    data.set(ctx.getImageData(0, 0, LAYER_SIZE, LAYER_SIZE).data, idx * size);
    applied++;
  }
  return applied;
}
