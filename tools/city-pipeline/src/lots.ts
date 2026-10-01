import { Clipper, FillRule, type Path64, type Paths64 } from 'clipper2-js';
import { lotPrice } from '@drivemart/shared';
import { GROUND_MATERIALS } from './classify';
import type { WorldSeg } from './facades';
import type { Grid } from './raster';

const CODE_ROAD = GROUND_MATERIALS.indexOf('road') + 1;
const CODE_SIDEWALK = GROUND_MATERIALS.indexOf('sidewalk') + 1;
const CODE_PLAZA = GROUND_MATERIALS.indexOf('plaza') + 1;
const CODE_SAND = GROUND_MATERIALS.indexOf('sand') + 1;
const isStreet = (c: number) => c === CODE_ROAD || c === CODE_SIDEWALK || c === CODE_PLAZA;

const SCALE = 100;

/** Zona de ação: retângulo no chão em frente à fachada. */
export interface Zone {
  x: number;
  z: number;
  y: number;
  /** Ângulo da tangente da fachada (rad). */
  angle: number;
  w: number;
  d: number;
}

export interface Lot {
  /** Preenchido depois pelo gerenciador de IDs. */
  id: string;
  /** Anel externo do terreno (x, z achatados). */
  poly: number[];
  /** Fachada: [x0, z0, x1, z1]. */
  facade: [number, number, number, number];
  /** Normal da fachada apontando para a rua. */
  normal: [number, number];
  y: number;
  height: number;
  floors: number;
  area: number;
  tint: [number, number, number];
  zone: Zone | null;
  orla: boolean;
  sector: string;
  price: number;
}

/** Parede sem lote (fachadas que não dão para a rua ou rasas demais). */
export interface Wall {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  h: number;
  tint: [number, number, number];
}

export interface LotOptions {
  maxDepth: number;
  minDepth: number;
  splitAbove: number;
  zoneMaxDistance: number;
}

const DEFAULTS: LotOptions = { maxDepth: 15, minDepth: 3, splitAbove: 26, zoneMaxDistance: 30 };

function polyArea(ring: number[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length;
    a += ring[i]! * ring[j + 1]! - ring[j]! * ring[i + 1]!;
  }
  return Math.abs(a) / 2;
}

function toPath(ring: number[]): Path64 {
  return Clipper.makePath(ring.map((v) => Math.round(v * SCALE)));
}

function sectorName(x: number, z: number, bounds: [number, number, number, number]): string {
  const col = Math.floor((x - bounds[0]) / 500);
  const row = Math.floor((z - bounds[1]) / 500) + 1;
  return `${String.fromCharCode(65 + Math.max(0, Math.min(25, col)))}${row}`;
}

/** Decide para que lado a fachada dá para a rua: +1 (normal do modelo), -1 (oposta) ou 0 (nenhum). */
function facing(seg: WorldSeg, grid: Grid): number {
  let front = 0,
    back = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const px = seg.x0 + (seg.x1 - seg.x0) * t;
    const pz = seg.z0 + (seg.z1 - seg.z0) * t;
    for (const d of [1.5, 3, 5]) {
      if (isStreet(grid.matAt(px + seg.nx * d, pz + seg.nz * d))) front++;
      if (isStreet(grid.matAt(px - seg.nx * d, pz - seg.nz * d))) back++;
    }
  }
  if (front >= 3 && front > back) return 1;
  if (back >= 3 && back > front) return -1;
  return 0;
}

function findZone(
  mx: number,
  mz: number,
  fx: number,
  fz: number,
  tx: number,
  tz: number,
  len: number,
  grid: Grid,
  maxDist: number,
): Zone | null {
  let dr = -1;
  for (let d = 0.5; d <= maxDist; d += 0.5) {
    if (grid.matAt(mx + fx * d, mz + fz * d) === CODE_ROAD) {
      dr = d;
      break;
    }
  }
  if (dr < 0) return null;
  const w = Math.max(4, Math.min(8, len - 1));
  const depth = 5;
  for (const extra of [2.5, 3.5, 2, 4.5]) {
    const cx = mx + fx * (dr + extra);
    const cz = mz + fz * (dr + extra);
    let ok = 0;
    for (const [a, b] of [
      [0, 0],
      [-w / 2 + 0.5, 0],
      [w / 2 - 0.5, 0],
      [0, -depth / 2 + 0.5],
      [0, depth / 2 - 0.5],
    ] as const) {
      if (grid.matAt(cx + tx * a + fx * b, cz + tz * a + fz * b) === CODE_ROAD) ok++;
    }
    if (ok >= 4) {
      return { x: cx, z: cz, y: grid.heightAt(cx, cz), angle: Math.atan2(tz, tx), w, d: depth };
    }
  }
  return null;
}

function nearSand(x: number, z: number, grid: Grid, radius: number): boolean {
  for (let r = 10; r <= radius; r += 15) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (grid.matAt(x + Math.cos(a) * r, z + Math.sin(a) * r) === CODE_SAND) return true;
    }
  }
  return false;
}

export function buildLots(
  segs: WorldSeg[],
  grid: Grid,
  bounds: [number, number, number, number],
  options: Partial<LotOptions> = {},
): { lots: Lot[]; walls: Wall[] } {
  const opts = { ...DEFAULTS, ...options };
  const lots: Lot[] = [];
  const walls: Wall[] = [];
  // Índice espacial simples dos lotes já criados (células de 32 m).
  const hash = new Map<string, number[]>();
  const hkey = (x: number, z: number) => `${Math.floor(x / 32)},${Math.floor(z / 32)}`;

  // Divide fachadas longas e ordena das maiores para as menores.
  const pieces: WorldSeg[] = [];
  for (const s of segs) {
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const n = len > opts.splitAbove ? Math.ceil(len / 16) : 1;
    for (let k = 0; k < n; k++) {
      pieces.push({
        ...s,
        x0: s.x0 + ((s.x1 - s.x0) * k) / n,
        z0: s.z0 + ((s.z1 - s.z0) * k) / n,
        x1: s.x0 + ((s.x1 - s.x0) * (k + 1)) / n,
        z1: s.z0 + ((s.z1 - s.z0) * (k + 1)) / n,
      });
    }
  }
  pieces.sort((a, b) => Math.hypot(b.x1 - b.x0, b.z1 - b.z0) - Math.hypot(a.x1 - a.x0, a.z1 - a.z0));

  for (const s of pieces) {
    const tint: [number, number, number] = [Math.round(s.r), Math.round(s.g), Math.round(s.b)];
    const wall: Wall = { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, y: s.y0, h: s.y1 - s.y0, tint };
    const side = facing(s, grid);
    if (!side) {
      walls.push(wall);
      continue;
    }
    const fx = s.nx * side,
      fz = s.nz * side;
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const tx = (s.x1 - s.x0) / len,
      tz = (s.z1 - s.z0) / len;

    // Profundidade livre para dentro da quadra.
    let depth = opts.maxDepth;
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const px = s.x0 + (s.x1 - s.x0) * t;
      const pz = s.z0 + (s.z1 - s.z0) * t;
      let d = 1;
      for (; d <= opts.maxDepth + 1; d += 0.5) {
        const qx = px - fx * d,
          qz = pz - fz * d;
        if (isStreet(grid.matAt(qx, qz)) || grid.lotAt(qx, qz)) break;
      }
      depth = Math.min(depth, d - 0.5);
    }
    if (depth < opts.minDepth) {
      walls.push(wall);
      continue;
    }

    let ring = [
      s.x0,
      s.z0,
      s.x1,
      s.z1,
      s.x1 - fx * depth,
      s.z1 - fz * depth,
      s.x0 - fx * depth,
      s.z0 - fz * depth,
    ];
    // Recorta contra lotes vizinhos para não sobrepor (esquinas).
    const near = new Set<number>();
    for (let i = 0; i < ring.length; i += 2)
      for (const id of hash.get(hkey(ring[i]!, ring[i + 1]!)) ?? []) near.add(id);
    if (near.size) {
      const clip: Paths64 = [...near].map((id) => toPath(lots[id]!.poly));
      const res = Clipper.Difference([toPath(ring)], clip, FillRule.NonZero);
      let best: number[] | null = null;
      let bestArea = 0;
      for (const p of res) {
        const r = Clipper.trimCollinear(p).flatMap((pt) => [pt.x / SCALE, pt.y / SCALE]);
        const a = polyArea(r);
        if (a > bestArea) {
          bestArea = a;
          best = r;
        }
      }
      if (!best || bestArea < polyArea(ring) * 0.5) {
        walls.push(wall);
        continue;
      }
      ring = best;
    }

    const area = polyArea(ring);
    const height = s.y1 - s.y0;
    const floors = Math.max(1, Math.round(height / 3.2));
    const mx = (s.x0 + s.x1) / 2,
      mz = (s.z0 + s.z1) / 2;
    const zone = findZone(mx, mz, fx, fz, tx, tz, len, grid, opts.zoneMaxDistance);
    const orla = nearSand(mx + fx * 10, mz + fz * 10, grid, 130);
    const lot: Lot = {
      id: '',
      poly: ring,
      facade: [s.x0, s.z0, s.x1, s.z1],
      normal: [fx, fz],
      y: s.y0,
      height,
      floors,
      area,
      tint,
      zone,
      orla,
      sector: sectorName(mx, mz, bounds),
      price: lotPrice({ area, floors, orla }),
    };
    const idx = lots.length;
    lots.push(lot);
    grid.fillLotPolygon([ring], idx + 1);
    const keys = new Set<string>();
    for (let i = 0; i < ring.length; i += 2) keys.add(hkey(ring[i]!, ring[i + 1]!));
    for (const k of keys) {
      let l = hash.get(k);
      if (!l) hash.set(k, (l = []));
      l.push(idx);
    }
  }
  // Paredes que ficaram dentro de um lote (fundo de painéis de dupla face) não aparecem: descarta.
  const visible = walls.filter((w) => !grid.lotAt((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2));
  return { lots, walls: visible };
}
