import { writeFileSync } from 'node:fs';
import earcut from 'earcut';
import { PNG } from 'pngjs';
import type { CityLayout } from '@drivemart/shared';

/** Cores das categorias na imagem de conferência (não têm relação com as texturas originais). */
const MAT_COLORS: Record<string, [number, number, number]> = {
  road: [70, 70, 78],
  sidewalk: [170, 170, 160],
  plaza: [140, 140, 130],
  sand: [222, 200, 140],
  dirt: [130, 95, 60],
  grass: [70, 130, 60],
  water: [50, 100, 170],
};

/** Desenha o traçado visto de cima para conferir o resultado do pipeline. */
export function renderDebugPng(
  layout: CityLayout,
  out: string,
  pxPerM: number,
  crop?: [number, number, number, number],
): void {
  const [bx0, bz0, bx1, bz1] = crop ?? layout.bounds;
  const W = Math.ceil((bx1 - bx0) * pxPerM),
    H = Math.ceil((bz1 - bz0) * pxPerM);
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) png.data.set([18, 22, 30, 255], i * 4);
  const px = (x: number) => (x - bx0) * pxPerM;
  const pz = (z: number) => (z - bz0) * pxPerM;
  const put = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    png.data.set(c, (y * W + x) * 4);
  };
  const tri = (a: number[], b: number[], c: number[], col: [number, number, number]) => {
    const area = (b[0]! - a[0]!) * (c[1]! - a[1]!) - (c[0]! - a[0]!) * (b[1]! - a[1]!);
    if (Math.abs(area) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(a[0]!, b[0]!, c[0]!))),
      x1 = Math.min(W - 1, Math.ceil(Math.max(a[0]!, b[0]!, c[0]!)));
    const y0 = Math.max(0, Math.floor(Math.min(a[1]!, b[1]!, c[1]!))),
      y1 = Math.min(H - 1, Math.ceil(Math.max(a[1]!, b[1]!, c[1]!)));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const qx = x + 0.5,
          qy = y + 0.5;
        const w0 = ((b[0]! - qx) * (c[1]! - qy) - (c[0]! - qx) * (b[1]! - qy)) / area;
        const w1 = ((c[0]! - qx) * (a[1]! - qy) - (a[0]! - qx) * (c[1]! - qy)) / area;
        if (w0 < 0 || w1 < 0 || 1 - w0 - w1 < 0) continue;
        put(x, y, col);
      }
  };
  const poly = (rings: number[][], col: [number, number, number]) => {
    const flat: number[] = [];
    const holes: number[] = [];
    rings.forEach((r, k) => {
      if (k) holes.push(flat.length / 2);
      for (let i = 0; i < r.length; i += 2) flat.push(px(r[i]!), pz(r[i + 1]!));
    });
    const t = earcut(flat, holes, 2);
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i]! * 2,
        b = t[i + 1]! * 2,
        c = t[i + 2]! * 2;
      tri([flat[a]!, flat[a + 1]!], [flat[b]!, flat[b + 1]!], [flat[c]!, flat[c + 1]!], col);
    }
  };
  const line = (x0: number, z0: number, x1: number, z1: number, col: [number, number, number]) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(px(x1) - px(x0), pz(z1) - pz(z0))));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      put(Math.round(px(x0 + (x1 - x0) * t)), Math.round(pz(z0 + (z1 - z0) * t)), col);
    }
  };

  // Chão, do mais baixo para o mais alto.
  const polys = Object.values(layout.chunks).flatMap((c) => c.g);
  polys.sort((a, b) => a.y - b.y);
  for (const p of polys) {
    const base = MAT_COLORS[layout.materials[p.m]!] ?? [255, 0, 255];
    const k = 1 + Math.min(0.6, p.y / 20);
    poly(p.r, base.map((v) => Math.min(255, v * k)) as [number, number, number]);
  }
  for (const c of Object.values(layout.chunks)) {
    const s = c.s ?? [];
    for (let i = 0; i < s.length; i += 10) {
      const col = MAT_COLORS[layout.materials[s[i]!]!] ?? [255, 0, 255];
      tri(
        [px(s[i + 1]!), pz(s[i + 3]!)],
        [px(s[i + 4]!), pz(s[i + 6]!)],
        [px(s[i + 7]!), pz(s[i + 9]!)],
        col,
      );
    }
  }
  // Lotes: preenchidos com a cor sugerida, mais escuros se não puderem ser comprados.
  for (const l of layout.lots) {
    const k = l.z ? 1 : 0.45;
    poly([l.p], l.c.map((v) => Math.round(v * k)) as [number, number, number]);
    line(l.f[0], l.f[1], l.f[2], l.f[3], [255, 255, 255]);
    if (l.z) {
      const [x, z, , ang, w, d] = l.z;
      const tx = Math.cos(ang),
        tz = Math.sin(ang);
      const fx = l.n[0],
        fz = l.n[1];
      const corner = (a: number, b: number): [number, number] => [x + tx * a + fx * b, z + tz * a + fz * b];
      const c = [corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)];
      for (let i = 0; i < 4; i++)
        line(c[i]![0], c[i]![1], c[(i + 1) % 4]![0], c[(i + 1) % 4]![1], [255, 210, 40]);
    }
  }
  for (let i = 0; i < layout.walls.length; i += 9) {
    line(layout.walls[i]!, layout.walls[i + 1]!, layout.walls[i + 2]!, layout.walls[i + 3]!, [200, 60, 60]);
  }
  for (let i = 0; i < layout.lowWalls.length; i += 6) {
    line(
      layout.lowWalls[i]!,
      layout.lowWalls[i + 1]!,
      layout.lowWalls[i + 2]!,
      layout.lowWalls[i + 3]!,
      [120, 120, 200],
    );
  }
  for (let i = 0; i < layout.trees.length; i += 5) {
    put(Math.round(px(layout.trees[i + 1]!)), Math.round(pz(layout.trees[i + 3]!)), [40, 220, 80]);
  }
  for (let i = 0; i < layout.props.length; i += 5) {
    put(Math.round(px(layout.props[i + 1]!)), Math.round(pz(layout.props[i + 3]!)), [255, 255, 255]);
  }
  const [sx, , sz] = layout.spawn;
  for (let a = 0; a < 40; a++)
    put(Math.round(px(sx) + Math.cos(a) * 4), Math.round(pz(sz) + Math.sin(a) * 4), [255, 0, 255]);
  writeFileSync(out, PNG.sync.write(png));
}
