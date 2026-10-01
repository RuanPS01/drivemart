import type { Model, Scene } from './scene';
import type { TriangleColors } from './world';

/** Segmento vertical (plano de parede) em coordenadas locais do modelo. */
interface LocalSeg {
  nx: number;
  nz: number;
  c: number;
  s0: number;
  s1: number;
  y0: number;
  y1: number;
  r: number;
  g: number;
  b: number;
}

/** Segmento vertical em coordenadas de mundo. A normal é a do modelo (pode apontar para dentro ou para fora). */
export interface WorldSeg {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  nx: number;
  nz: number;
  y0: number;
  y1: number;
  r: number;
  g: number;
  b: number;
  inst: number;
}

export interface SegOptions {
  minLength: number;
  minHeight: number;
  maxHeight: number;
}

/** Extrai e funde os triângulos verticais de um modelo em segmentos de parede. */
export function modelSegments(model: Model, colors: TriangleColors, opts: SegOptions): LocalSeg[] {
  type Piece = {
    s0: number;
    s1: number;
    y0: number;
    y1: number;
    area: number;
    r: number;
    g: number;
    b: number;
  };
  const groups = new Map<string, { nx: number; nz: number; c: number; pieces: Piece[] }>();
  model.parts.forEach((part, pi) => {
    const col = colors.of(model, pi);
    const P = part.positions;
    for (let t = 0; t < P.length / 9; t++) {
      if (col[t * 4 + 3]! < 0.3) continue;
      const o = t * 9;
      const ax = P[o + 3]! - P[o]!,
        ay = P[o + 4]! - P[o + 1]!,
        az = P[o + 5]! - P[o + 2]!;
      const bx = P[o + 6]! - P[o]!,
        by = P[o + 7]! - P[o + 1]!,
        bz = P[o + 8]! - P[o + 2]!;
      let nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-9 || Math.abs(ny / len) > 0.25) continue;
      const hl = Math.hypot(nx, nz);
      nx /= hl;
      nz /= hl;
      const ang = Math.round(Math.atan2(nz, nx) / (Math.PI / 36));
      const c = nx * P[o]! + nz * P[o + 2]!;
      const key = `${ang}:${Math.round(c / 0.3)}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { nx, nz, c, pieces: [] }));
      const tx = -nz,
        tz = nx;
      const ss = [0, 3, 6].map((k) => tx * P[o + k]! + tz * P[o + k + 2]!);
      const ys = [P[o + 1]!, P[o + 4]!, P[o + 7]!];
      g.pieces.push({
        s0: Math.min(...ss),
        s1: Math.max(...ss),
        y0: Math.min(...ys),
        y1: Math.max(...ys),
        area: len / 2,
        r: col[t * 4]!,
        g: col[t * 4 + 1]!,
        b: col[t * 4 + 2]!,
      });
    }
  });

  const out: LocalSeg[] = [];
  for (const g of groups.values()) {
    g.pieces.sort((a, b) => a.s0 - b.s0);
    let cur: (Piece & { wsum: number }) | null = null;
    const flush = () => {
      if (!cur) return;
      const length = cur.s1 - cur.s0;
      const height = cur.y1 - cur.y0;
      if (length >= opts.minLength && height >= opts.minHeight && height <= opts.maxHeight) {
        out.push({
          nx: g.nx,
          nz: g.nz,
          c: g.c,
          s0: cur.s0,
          s1: cur.s1,
          y0: cur.y0,
          y1: cur.y1,
          r: cur.r / cur.wsum,
          g: cur.g / cur.wsum,
          b: cur.b / cur.wsum,
        });
      }
      cur = null;
    };
    for (const p of g.pieces) {
      if (cur && p.s0 <= cur.s1 + 0.6) {
        cur.s1 = Math.max(cur.s1, p.s1);
        cur.y0 = Math.min(cur.y0, p.y0);
        cur.y1 = Math.max(cur.y1, p.y1);
        cur.r += p.r * p.area;
        cur.g += p.g * p.area;
        cur.b += p.b * p.area;
        cur.wsum += p.area;
      } else {
        flush();
        cur = { ...p, r: p.r * p.area, g: p.g * p.area, b: p.b * p.area, wsum: p.area };
      }
    }
    flush();
  }
  return out;
}

/** Segmentos de parede de todas as instâncias de uma classe, em coordenadas de mundo. */
export function worldSegments(
  scene: Scene,
  include: (model: string) => boolean,
  colors: TriangleColors,
  opts: SegOptions,
): WorldSeg[] {
  const cache = new Map<string, LocalSeg[]>();
  const out: WorldSeg[] = [];
  scene.instances.forEach((inst, idx) => {
    if (!include(inst.model)) return;
    let segs = cache.get(inst.model);
    if (!segs) {
      segs = modelSegments(scene.models.get(inst.model)!, colors, opts);
      cache.set(inst.model, segs);
    }
    const cs = Math.cos(inst.rot),
      sn = Math.sin(inst.rot);
    const rot = (x: number, z: number): [number, number] => [cs * x + sn * z, -sn * x + cs * z];
    for (const s of segs) {
      const tx = -s.nz,
        tz = s.nx;
      const [ax, az] = rot(s.nx * s.c + tx * s.s0, s.nz * s.c + tz * s.s0);
      const [bx, bz] = rot(s.nx * s.c + tx * s.s1, s.nz * s.c + tz * s.s1);
      const [nx, nz] = rot(s.nx, s.nz);
      out.push({
        x0: ax + inst.x,
        z0: az + inst.z,
        x1: bx + inst.x,
        z1: bz + inst.z,
        nx,
        nz,
        y0: s.y0 + inst.y,
        y1: s.y1 + inst.y,
        r: s.r,
        g: s.g,
        b: s.b,
        inst: idx,
      });
    }
  });
  return out;
}
