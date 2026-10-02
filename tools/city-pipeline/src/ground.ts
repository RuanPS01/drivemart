import { Clipper, FillRule, type Path64, type Paths64 } from 'clipper2-js';
import { GROUND_MATERIALS, groundMatFromColor, type GroundMat, type ModelClass } from './classify';
import { Grid } from './raster';
import { findRegion, type GroundRegion } from './regions';
import type { Scene } from './scene';
import { forEachWorldTri, type TriangleColors } from './world';

/** Polígono de chão plano: anel externo + furos, em metros (x, z achatados). */
export interface GroundPoly {
  mat: GroundMat;
  y: number;
  rings: number[][];
}

/** Triângulo de chão inclinado (rampas e encostas). */
export interface SlopeTri {
  mat: GroundMat;
  /** 9 números: x, y, z de cada vértice. */
  p: number[];
}

export interface GroundChunk {
  polys: GroundPoly[];
  slopes: SlopeTri[];
}

export interface GroundResult {
  chunks: Map<string, GroundChunk>;
  grid: Grid;
}

const SCALE = 100; // Clipper trabalha com inteiros: centímetros.
const FLAT_NY = 0.995;

export function chunkKey(x: number, z: number, size: number): string {
  return `${Math.floor(x / size)},${Math.floor(z / size)}`;
}

function toPath(p: Float64Array): Path64 {
  return Clipper.makePath([
    Math.round(p[0]! * SCALE),
    Math.round(p[2]! * SCALE),
    Math.round(p[3]! * SCALE),
    Math.round(p[5]! * SCALE),
    Math.round(p[6]! * SCALE),
    Math.round(p[8]! * SCALE),
  ]);
}

function ringToMeters(path: Path64): number[] {
  const out: number[] = [];
  for (const pt of path) out.push(pt.x / SCALE, pt.y / SCALE);
  return out;
}

function pointInRing(x: number, y: number, ring: Path64): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Agrupa o resultado de uma união do Clipper em polígonos com furos.
 * Anéis com área positiva são externos; negativos são furos e vão para o menor externo que os contém.
 */
export function groupRings(paths: Paths64): Path64[][] {
  const outers: { ring: Path64; area: number; holes: Path64[] }[] = [];
  const holes: Path64[] = [];
  for (const raw of paths) {
    const ring = Clipper.trimCollinear(Clipper.simplifyPath(Clipper.stripDuplicates(raw, true), 4, true));
    if (ring.length < 3) continue;
    const area = Clipper.area(ring);
    if (Math.abs(area) < SCALE * SCALE * 0.05) continue;
    if (area > 0) outers.push({ ring, area, holes: [] });
    else holes.push(ring);
  }
  outers.sort((a, b) => a.area - b.area);
  for (const h of holes) {
    const pt = h[0]!;
    const owner = outers.find((o) => pointInRing(pt.x + 0.5, pt.y + 0.5, o.ring));
    owner?.holes.push(h);
  }
  return outers.map((o) => [o.ring, ...o.holes]);
}

export function buildGround(
  scene: Scene,
  classes: Map<string, ModelClass>,
  colors: TriangleColors,
  chunkSize: number,
  bounds: [number, number, number, number],
  /** Driver 1: material pela região da textura (antes da cor média). */
  regions: readonly GroundRegion[] = [],
  fallback: Partial<Record<GroundMat, GroundMat>> = {},
): GroundResult {
  const grid = new Grid(bounds[0], bounds[1], bounds[2], bounds[3], 1);
  // balde[chunk][material][altura em dm] = triângulos (Clipper)
  const buckets = new Map<string, Map<GroundMat, Map<number, Paths64>>>();
  const slopes = new Map<string, SlopeTri[]>();

  for (const inst of scene.instances) {
    const cls = classes.get(inst.model);
    if (!cls || (cls.kind !== 'ground' && cls.kind !== 'terrain')) continue;
    forEachWorldTri(scene, inst, colors, (t) => {
      if (t.cov < 0.25) return; // triângulo quase todo transparente (decalques)
      const ny = Math.abs(t.ny);
      if (ny < 0.25) return; // paredes verticais (meio-fio é gerado depois)
      const p = t.p;
      const yAvg = (p[1]! + p[4]! + p[7]!) / 3;
      const raised = yAvg > 0.05 && yAvg < 0.3;
      let mat: GroundMat;
      const region = regions.length ? findRegion(regions, t.tex, t.tx, t.ty) : undefined;
      if (cls.kind === 'ground' && cls.mat) mat = cls.mat;
      else if (region) mat = region.mat;
      else {
        mat = groundMatFromColor(t.r, t.g, t.b, raised);
        mat = fallback[mat] ?? mat;
        if (cls.kind === 'terrain' && (mat === 'road' || mat === 'sidewalk')) mat = 'plaza';
      }
      const cx = (p[0]! + p[3]! + p[6]!) / 3;
      const cz = (p[2]! + p[5]! + p[8]!) / 3;
      const key = chunkKey(cx, cz, chunkSize);
      const code = GROUND_MATERIALS.indexOf(mat) + 1;
      // Grade de análise: material de maior prioridade vence, altura do topo.
      grid.fillTriangle(p[0]!, p[2]!, p[3]!, p[5]!, p[6]!, p[8]!, (idx, w0, w1, w2) => {
        const cur = grid.mat[idx]!;
        const y = w0 * p[1]! + w1 * p[4]! + w2 * p[7]!;
        if (cur === 0 || code < cur || y * 10 > grid.height[idx]! + 5) {
          grid.mat[idx] = code;
          grid.height[idx] = Math.round(y * 10);
        }
      });
      if (ny >= FLAT_NY) {
        const hk = Math.round(yAvg * 10);
        let byMat = buckets.get(key);
        if (!byMat) buckets.set(key, (byMat = new Map()));
        let byH = byMat.get(mat);
        if (!byH) byMat.set(mat, (byH = new Map()));
        let paths = byH.get(hk);
        if (!paths) byH.set(hk, (paths = []));
        paths.push(toPath(p));
      } else {
        let list = slopes.get(key);
        if (!list) slopes.set(key, (list = []));
        list.push({ mat, p: Array.from(p, (v) => Math.round(v * 100) / 100) });
      }
    });
  }

  const chunks = new Map<string, GroundChunk>();
  for (const key of new Set([...buckets.keys(), ...slopes.keys()])) {
    const polys: GroundPoly[] = [];
    const byMat = buckets.get(key);
    if (byMat) {
      // Une por altura respeitando a prioridade: material mais importante recorta os demais na mesma altura.
      const heights = new Set<number>();
      for (const byH of byMat.values()) for (const h of byH.keys()) heights.add(h);
      for (const hk of heights) {
        let covered: Paths64 = [];
        for (const mat of GROUND_MATERIALS) {
          const paths = byMat.get(mat)?.get(hk);
          if (!paths?.length) continue;
          let merged = Clipper.Union(paths, undefined, FillRule.NonZero);
          if (covered.length) merged = Clipper.Difference(merged, covered, FillRule.NonZero);
          if (!merged.length) continue;
          covered = covered.length ? Clipper.Union(covered, merged, FillRule.NonZero) : merged;
          for (const rings of groupRings(merged))
            polys.push({ mat, y: hk / 10, rings: rings.map(ringToMeters) });
        }
      }
    }
    chunks.set(key, { polys, slopes: slopes.get(key) ?? [] });
  }
  return { chunks, grid };
}
