import earcut from 'earcut';
import {
  LOW_WALL_STRIDE,
  PROP_STRIDE,
  SLOPE_STRIDE,
  TREE_STRIDE,
  WALL_STRIDE,
  type CityLayout,
  type LayoutLot,
} from '@drivemart/shared';
import { FACADE_FAMILIES, LAYER, SHOP_LAYERS, type LayerName } from '../art/TextureLibrary';
import { faceShade, MeshBuilder, type MeshData, type Vec3 } from './meshBuilder';
import { POLE_PROPS, PROP_BUILDERS } from './props';

/** Altura do térreo comercial (m). */
export const SHOP_HEIGHT = 4;
/** Lado do quadrado que a textura de fachada cobre (2 vãos x 2 andares). */
export const FACADE_TILE = 6.4;

export interface TreeData {
  center: Float32Array;
  corner: Float32Array;
  uv: Float32Array;
  layer: Uint8Array;
  index: Uint32Array;
}

export interface ChunkColliders {
  /** Caixas: cx, cy, cz, hx, hy, hz, rotY (7 números por caixa). */
  boxes: Float32Array;
  /** Trimesh do chão (sem água). */
  groundPosition: Float32Array;
  groundIndex: Uint32Array;
}

export interface ChunkBuild {
  key: string;
  mesh: MeshData;
  trees: TreeData;
  colliders: ChunkColliders;
}

export interface CityIndex {
  layout: CityLayout;
  keys: string[];
  lotsByChunk: Map<string, LayoutLot[]>;
  wallsByChunk: Map<string, number[]>;
  lowWallsByChunk: Map<string, number[]>;
  propsByChunk: Map<string, number[]>;
  treesByChunk: Map<string, number[]>;
  nearSand: Set<string>;
}

export function chunkKey(x: number, z: number, size: number): string {
  return `${Math.floor(x / size)},${Math.floor(z / size)}`;
}

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function push<T>(map: Map<string, T[]>, key: string, ...items: T[]): void {
  let l = map.get(key);
  if (!l) map.set(key, (l = []));
  l.push(...items);
}

export function indexLayout(layout: CityLayout): CityIndex {
  const size = layout.chunkSize;
  const lotsByChunk = new Map<string, LayoutLot[]>();
  for (const lot of layout.lots) {
    push(lotsByChunk, chunkKey((lot.f[0] + lot.f[2]) / 2, (lot.f[1] + lot.f[3]) / 2, size), lot);
  }
  const strided = (arr: number[], stride: number, xi: number, zi: number, x2?: number, z2?: number) => {
    const m = new Map<string, number[]>();
    for (let i = 0; i < arr.length; i += stride) {
      const x = x2 === undefined ? arr[i + xi]! : (arr[i + xi]! + arr[i + x2]!) / 2;
      const z = z2 === undefined ? arr[i + zi]! : (arr[i + zi]! + arr[i + z2]!) / 2;
      push(m, chunkKey(x, z, size), ...arr.slice(i, i + stride));
    }
    return m;
  };
  const sandIdx = layout.materials.indexOf('sand');
  const nearSand = new Set<string>();
  for (const ch of Object.values(layout.chunks)) {
    for (const p of ch.g) {
      if (p.m !== sandIdx) continue;
      const ring = p.r[0]!;
      for (let i = 0; i < ring.length; i += 2) {
        const ci = Math.floor(ring[i]! / 32),
          cj = Math.floor(ring[i + 1]! / 32);
        for (let di = -2; di <= 2; di++)
          for (let dj = -2; dj <= 2; dj++) nearSand.add(`${ci + di},${cj + dj}`);
      }
    }
  }
  const index: CityIndex = {
    layout,
    keys: [],
    lotsByChunk,
    wallsByChunk: strided(layout.walls, WALL_STRIDE, 0, 1, 2, 3),
    lowWallsByChunk: strided(layout.lowWalls, LOW_WALL_STRIDE, 0, 1, 2, 3),
    propsByChunk: strided(layout.props, PROP_STRIDE, 1, 3),
    treesByChunk: strided(layout.trees, TREE_STRIDE, 1, 3),
    nearSand,
  };
  index.keys = [
    ...new Set([
      ...Object.keys(layout.chunks),
      ...lotsByChunk.keys(),
      ...index.wallsByChunk.keys(),
      ...index.lowWallsByChunk.keys(),
      ...index.propsByChunk.keys(),
      ...index.treesByChunk.keys(),
    ]),
  ];
  return index;
}

const GROUND_LAYER: Record<string, { layer: LayerName; scale: number }> = {
  road: { layer: 'asphalt', scale: 8 },
  sidewalk: { layer: 'sidewalk', scale: 6.4 },
  plaza: { layer: 'plaza', scale: 6.4 },
  sand: { layer: 'sand', scale: 8 },
  dirt: { layer: 'dirt', scale: 8 },
  grass: { layer: 'grass', scale: 8 },
  water: { layer: 'water', scale: 12 },
};

const NEUTRAL: Vec3 = [1, 1, 1];
const PASTELS: Vec3[] = [
  [1.08, 1.0, 0.86],
  [1.1, 0.9, 0.82],
  [0.88, 0.98, 1.1],
  [0.9, 1.05, 0.9],
  [1.1, 1.06, 0.78],
  [1.08, 0.9, 0.95],
  [1.05, 1.05, 1.05],
];

/** Tinta do prédio: cor sugerida pelo traçado misturada com uma cor pastel escolhida pelo hash do ID. */
export function lotTint(c: [number, number, number], seed: number): Vec3 {
  const lum = (c[0] + c[1] + c[2]) / 3 || 1;
  const ratio: Vec3 = [c[0] / lum, c[1] / lum, c[2] / lum];
  const bright = Math.min(1.12, Math.max(0.78, lum / 150));
  const pastel = PASTELS[seed % PASTELS.length]!;
  return [0, 1, 2].map((i) => (1 + (ratio[i]! - 1) * 0.5) * 0.6 * bright + pastel[i]! * 0.4) as Vec3;
}

export function pickFamily(lot: LayoutLot, seed: number): LayerName {
  const [r, g, b] = lot.c;
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
  if (lot.h > 24) return (['facadeGlass', 'facadeModern', 'facadeConcrete'] as LayerName[])[seed % 3]!;
  if (r > g + 18 && r > b + 25) return 'facadeBrick';
  if (lot.o) return seed % 2 ? 'facadeModern' : 'facadeTile';
  if (l > 0.62) return (['facadeColonial', 'facadeTile', 'facadeModern'] as LayerName[])[seed % 3]!;
  if (l < 0.35) return (['facadeGlass', 'facadeConcrete2'] as LayerName[])[seed % 2]!;
  return FACADE_FAMILIES[seed % FACADE_FAMILIES.length]!;
}

function signedArea(ring: number[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    a += ring[i]! * ring[j + 1]! - ring[j]! * ring[i + 1]!;
  }
  return a / 2;
}

/** Garante que o anel percorra o sentido em que a normal (-dz, dx) de cada aresta aponte para fora. */
export function outwardRing(ring: number[]): number[] {
  if (signedArea(ring) <= 0) return ring;
  const out: number[] = [];
  for (let i = ring.length - 2; i >= 0; i -= 2) out.push(ring[i]!, ring[i + 1]!);
  return out;
}

/** Índice da aresta do anel que corresponde à fachada do lote. */
export function facadeEdge(ring: number[], f: [number, number, number, number]): number {
  const fx = (f[0] + f[2]) / 2,
    fz = (f[1] + f[3]) / 2;
  const fl = Math.hypot(f[2] - f[0], f[3] - f[1]) || 1;
  const fdx = (f[2] - f[0]) / fl,
    fdz = (f[3] - f[1]) / fl;
  let best = 0,
    bestScore = Infinity;
  const n = ring.length / 2;
  for (let k = 0; k < n; k++) {
    const ax = ring[k * 2]!,
      az = ring[k * 2 + 1]!;
    const bx = ring[((k + 1) % n) * 2]!,
      bz = ring[((k + 1) % n) * 2 + 1]!;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const par = Math.abs(((bx - ax) * fdx + (bz - az) * fdz) / len);
    const d = Math.hypot((ax + bx) / 2 - fx, (az + bz) / 2 - fz);
    const score = d + (1 - par) * 20 - Math.min(len, fl) * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

/** Caixa de colisão de um lote, alinhada à fachada. */
export function lotBox(lot: LayoutLot): [number, number, number, number, number, number, number] {
  const fl = Math.hypot(lot.f[2] - lot.f[0], lot.f[3] - lot.f[1]) || 1;
  const tx = (lot.f[2] - lot.f[0]) / fl,
    tz = (lot.f[3] - lot.f[1]) / fl;
  let t0 = Infinity,
    t1 = -Infinity,
    n0 = Infinity,
    n1 = -Infinity;
  for (let i = 0; i < lot.p.length; i += 2) {
    const x = lot.p[i]! - lot.f[0],
      z = lot.p[i + 1]! - lot.f[1];
    const t = x * tx + z * tz,
      n = -x * tz + z * tx;
    t0 = Math.min(t0, t);
    t1 = Math.max(t1, t);
    n0 = Math.min(n0, n);
    n1 = Math.max(n1, n);
  }
  const ct = (t0 + t1) / 2,
    cn = (n0 + n1) / 2;
  const cx = lot.f[0] + tx * ct - tz * cn;
  const cz = lot.f[1] + tz * ct + tx * cn;
  // Rotação em Y que leva o eixo X local para (tx, tz): x' = cos·x + sin·z, z' = -sin·x + cos·z.
  const rot = Math.atan2(-tz, tx);
  return [cx, lot.y + lot.h / 2, cz, (t1 - t0) / 2, lot.h / 2, (n1 - n0) / 2, rot];
}

const propCache = new Map<string, MeshData>();
function propMesh(type: string): MeshData | null {
  const builder = PROP_BUILDERS[type];
  if (!builder) return null;
  let m = propCache.get(type);
  if (!m) propCache.set(type, (m = builder()));
  return m;
}

export function buildChunk(index: CityIndex, key: string): ChunkBuild {
  const { layout } = index;
  const mesh = new MeshBuilder();
  const groundPos: number[] = [];
  const groundIdx: number[] = [];
  const boxes: number[] = [];
  const waterIdx = layout.materials.indexOf('water');

  const addGroundTri = (a: Vec3, b: Vec3, c: Vec3) => {
    const base = groundPos.length / 3;
    groundPos.push(...a, ...b, ...c);
    groundIdx.push(base, base + 1, base + 2);
  };

  // Chão plano.
  const chunk = layout.chunks[key];
  for (const poly of chunk?.g ?? []) {
    const matName = layout.materials[poly.m]!;
    const conf = GROUND_LAYER[matName] ?? GROUND_LAYER.plaza!;
    const ring0 = poly.r[0]!;
    let layer = LAYER[conf.layer];
    if ((matName === 'sidewalk' || matName === 'plaza') && poly.y > 0.05) {
      for (let i = 0; i < ring0.length; i += 2) {
        if (index.nearSand.has(`${Math.floor(ring0[i]! / 32)},${Math.floor(ring0[i + 1]! / 32)}`)) {
          layer = LAYER.calcadao;
          break;
        }
      }
    }
    const flat: number[] = [];
    const holes: number[] = [];
    poly.r.forEach((r, k) => {
      if (k) holes.push(flat.length / 2);
      flat.push(...r);
    });
    const tris = earcut(flat, holes, 2);
    const y = poly.y;
    for (let t = 0; t < tris.length; t += 3) {
      let ia = tris[t]!,
        ib = tris[t + 1]!;
      const ic = tris[t + 2]!;
      const ax = flat[ia * 2]!,
        az = flat[ia * 2 + 1]!;
      const bx = flat[ib * 2]!,
        bz = flat[ib * 2 + 1]!;
      const cx = flat[ic * 2]!,
        cz = flat[ic * 2 + 1]!;
      // Normal para cima: (b-a) x (c-a) com componente y positiva.
      if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) < 0) [ia, ib] = [ib, ia];
      const v = [ia, ib, ic].map((i) =>
        mesh.vertex(
          flat[i * 2]!,
          y,
          flat[i * 2 + 1]!,
          flat[i * 2]! / conf.scale,
          flat[i * 2 + 1]! / conf.scale,
          layer,
          NEUTRAL,
          1,
        ),
      );
      mesh.triangle(v[0]!, v[1]!, v[2]!);
      if (poly.m !== waterIdx) {
        addGroundTri(
          [flat[ia * 2]!, y, flat[ia * 2 + 1]!],
          [flat[ib * 2]!, y, flat[ib * 2 + 1]!],
          [flat[ic * 2]!, y, flat[ic * 2 + 1]!],
        );
      }
    }
    // Meio-fio: saia vertical nas bordas de polígonos elevados.
    if (y > 0.04 && y < 0.5 && matName !== 'water') {
      for (const r of poly.r) {
        const ring = outwardRing(r);
        const n = ring.length / 2;
        for (let k = 0; k < n; k++) {
          const ax = ring[k * 2]!,
            az = ring[k * 2 + 1]!;
          const bx = ring[((k + 1) % n) * 2]!,
            bz = ring[((k + 1) % n) * 2 + 1]!;
          mesh.wall(ax, az, bx, bz, y - 0.3, y, LAYER.curb, NEUTRAL, 6.4, 1);
          addGroundTri([ax, y - 0.3, az], [bx, y - 0.3, bz], [bx, y, bz]);
          addGroundTri([ax, y - 0.3, az], [bx, y, bz], [ax, y, az]);
        }
      }
    }
  }

  // Rampas e encostas.
  const s = chunk?.s ?? [];
  for (let i = 0; i < s.length; i += SLOPE_STRIDE) {
    const matName = layout.materials[s[i]!]!;
    const conf = GROUND_LAYER[matName] ?? GROUND_LAYER.dirt!;
    let a: Vec3 = [s[i + 1]!, s[i + 2]!, s[i + 3]!],
      b: Vec3 = [s[i + 4]!, s[i + 5]!, s[i + 6]!];
    const c: Vec3 = [s[i + 7]!, s[i + 8]!, s[i + 9]!];
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    if (ny < 0) {
      [a, b] = [b, a];
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const nl = Math.hypot(nx, ny, nz) || 1;
    const sh = faceShade(nx / nl, ny / nl, nz / nl);
    const layer = LAYER[conf.layer];
    const v = [a, b, c].map((p) =>
      mesh.vertex(p[0], p[1], p[2], p[0] / conf.scale, p[2] / conf.scale, layer, NEUTRAL, sh),
    );
    mesh.triangle(v[0]!, v[1]!, v[2]!);
    if (s[i] !== waterIdx) addGroundTri(a, b, c);
  }

  // Prédios.
  for (const lot of index.lotsByChunk.get(key) ?? []) {
    const seed = hashString(lot.id);
    const tint = lotTint(lot.c, seed);
    const family = LAYER[pickFamily(lot, seed)];
    const shop = LAYER[SHOP_LAYERS[(seed >>> 3) % SHOP_LAYERS.length]!];
    const ring = outwardRing(lot.p);
    const fe = facadeEdge(ring, lot.f);
    const n = ring.length / 2;
    const y0 = lot.y,
      y1 = lot.y + lot.h;
    const shopTop = lot.h > 6 ? y0 + SHOP_HEIGHT : y0;
    for (let k = 0; k < n; k++) {
      const ax = ring[k * 2]!,
        az = ring[k * 2 + 1]!;
      const bx = ring[((k + 1) % n) * 2]!,
        bz = ring[((k + 1) % n) * 2 + 1]!;
      if (k === fe) {
        if (shopTop > y0) mesh.wall(ax, az, bx, bz, y0, shopTop, shop, tint, FACADE_TILE, SHOP_HEIGHT);
        mesh.wall(ax, az, bx, bz, shopTop, y1, family, tint, FACADE_TILE, FACADE_TILE);
      } else {
        mesh.wall(ax, az, bx, bz, y0, y1, LAYER.facadeSide, tint, FACADE_TILE, FACADE_TILE);
      }
    }
    // Telhado.
    const tris = earcut(ring, undefined, 2);
    for (let t = 0; t < tris.length; t += 3) {
      let ia = tris[t]!,
        ib = tris[t + 1]!;
      const ic = tris[t + 2]!;
      const ax = ring[ia * 2]!,
        az = ring[ia * 2 + 1]!;
      if (
        (ring[ib * 2 + 1]! - az) * (ring[ic * 2]! - ax) - (ring[ib * 2]! - ax) * (ring[ic * 2 + 1]! - az) <
        0
      )
        [ia, ib] = [ib, ia];
      const v = [ia, ib, ic].map((i) =>
        mesh.vertex(
          ring[i * 2]!,
          y1,
          ring[i * 2 + 1]!,
          ring[i * 2]! / 6.4,
          ring[i * 2 + 1]! / 6.4,
          LAYER.roof,
          NEUTRAL,
          0.92,
        ),
      );
      mesh.triangle(v[0]!, v[1]!, v[2]!);
    }
    boxes.push(...lotBox(lot));
  }

  // Paredes sem lote e muretas: caixas finas.
  const walls = index.wallsByChunk.get(key) ?? [];
  for (let i = 0; i < walls.length; i += WALL_STRIDE) {
    const [x0, z0, x1, z1, y, h, r, g, b] = walls.slice(i, i + WALL_STRIDE) as number[];
    const len = Math.hypot(x1! - x0!, z1! - z0!);
    const rot = Math.atan2(-(z1! - z0!), x1! - x0!);
    const tint = lotTint([r!, g!, b!], hashString(`${x0},${z0}`));
    mesh.box(
      (x0! + x1!) / 2,
      y! + h! / 2,
      (z0! + z1!) / 2,
      len / 2,
      h! / 2,
      0.15,
      rot,
      LAYER.facadeSide,
      tint,
      FACADE_TILE,
      LAYER.roof,
    );
    boxes.push((x0! + x1!) / 2, y! + h! / 2, (z0! + z1!) / 2, len / 2, h! / 2, 0.15, rot);
  }
  const low = index.lowWallsByChunk.get(key) ?? [];
  for (let i = 0; i < low.length; i += LOW_WALL_STRIDE) {
    const [x0, z0, x1, z1, y, h] = low.slice(i, i + LOW_WALL_STRIDE) as number[];
    const len = Math.hypot(x1! - x0!, z1! - z0!);
    const rot = Math.atan2(-(z1! - z0!), x1! - x0!);
    mesh.box(
      (x0! + x1!) / 2,
      y! + h! / 2,
      (z0! + z1!) / 2,
      len / 2,
      h! / 2,
      0.12,
      rot,
      LAYER.concrete,
      NEUTRAL,
      2,
    );
    boxes.push((x0! + x1!) / 2, y! + h! / 2, (z0! + z1!) / 2, len / 2, h! / 2, 0.12, rot);
  }

  // Props.
  const props = index.propsByChunk.get(key) ?? [];
  for (let i = 0; i < props.length; i += PROP_STRIDE) {
    const type = layout.propTypes[props[i]!]!;
    const pm = propMesh(type);
    if (!pm) continue;
    const x = props[i + 1]!,
      y = props[i + 2]!,
      z = props[i + 3]!,
      rot = props[i + 4]!;
    mesh.append(pm, x, y, z, rot);
    const pole = POLE_PROPS[type];
    if (pole) boxes.push(x, y + pole.h / 2, z, pole.r, pole.h / 2, pole.r, rot);
  }

  // Vegetação: billboards cilíndricos.
  const center: number[] = [];
  const corner: number[] = [];
  const tuv: number[] = [];
  const tlayer: number[] = [];
  const tidx: number[] = [];
  const trees = index.treesByChunk.get(key) ?? [];
  for (let i = 0; i < trees.length; i += TREE_STRIDE) {
    const type = layout.treeTypes[trees[i]!]!;
    const x = trees[i + 1]!,
      y = trees[i + 2]!,
      z = trees[i + 3]!,
      h = Math.max(0.6, trees[i + 4]!);
    const w = type === 'palm' ? h * 0.62 : type === 'tree' ? h * 0.95 : h * 1.6;
    const layer = type === 'palm' ? LAYER.palm : type === 'tree' ? LAYER.tree : LAYER.bush;
    const base = center.length / 3;
    for (const [cx, cy, u, v] of [
      [-0.5, 0, 0, 1],
      [0.5, 0, 1, 1],
      [0.5, 1, 1, 0],
      [-0.5, 1, 0, 0],
    ] as const) {
      center.push(x, y, z);
      corner.push(cx * w, cy * h);
      tuv.push(u, v);
      tlayer.push(layer);
    }
    tidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    if (type !== 'bush') boxes.push(x, y + 1.5, z, 0.2, 1.5, 0.2, 0);
  }

  return {
    key,
    mesh: mesh.build(),
    trees: {
      center: new Float32Array(center),
      corner: new Float32Array(corner),
      uv: new Float32Array(tuv),
      layer: new Uint8Array(tlayer),
      index: new Uint32Array(tidx),
    },
    colliders: {
      boxes: new Float32Array(boxes),
      groundPosition: new Float32Array(groundPos),
      groundIndex: new Uint32Array(groundIdx),
    },
  };
}
