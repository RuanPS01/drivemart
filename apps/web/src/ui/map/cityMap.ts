import type { CityLayout } from '@drivemart/shared';

/** Cores do mapa (vista de cima, estilo do mapa do Driver 2). */
export const MAP_COLORS: Record<string, string> = {
  road: '#4a4d57',
  sidewalk: '#8d8f96',
  plaza: '#7b7d84',
  sand: '#c9b27a',
  dirt: '#6b5236',
  grass: '#3f6b33',
  water: '#1f4a78',
  lot: '#20232b',
  lotEdge: '#2c303a',
  background: '#0d1018',
};

export interface CityMapImage {
  canvas: HTMLCanvasElement;
  /** Pixels por metro. */
  scale: number;
  minX: number;
  minZ: number;
}

let cache: { layout: CityLayout; image: CityMapImage } | null = null;

/** Desenha (uma vez) o mapa da cidade a partir do traçado. */
export function cityMapImage(layout: CityLayout, scale = 0.5): CityMapImage {
  if (cache?.layout === layout) return cache.image;
  const [minX, minZ, maxX, maxZ] = layout.bounds;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((maxX - minX) * scale);
  canvas.height = Math.ceil((maxZ - minZ) * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = MAP_COLORS.background!;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tx = (x: number) => (x - minX) * scale;
  const tz = (z: number) => (z - minZ) * scale;
  const ring = (path: Path2D, r: number[]) => {
    for (let i = 0; i < r.length; i += 2) {
      if (i === 0) path.moveTo(tx(r[i]!), tz(r[i + 1]!));
      else path.lineTo(tx(r[i]!), tz(r[i + 1]!));
    }
    path.closePath();
  };
  const polys = Object.values(layout.chunks).flatMap((c) => c.g);
  polys.sort((a, b) => a.y - b.y);
  for (const p of polys) {
    const path = new Path2D();
    for (const r of p.r) ring(path, r);
    ctx.fillStyle = MAP_COLORS[layout.materials[p.m]!] ?? '#555';
    ctx.fill(path, 'evenodd');
  }
  ctx.fillStyle = MAP_COLORS.lot!;
  ctx.strokeStyle = MAP_COLORS.lotEdge!;
  ctx.lineWidth = 1;
  for (const lot of layout.lots) {
    const path = new Path2D();
    ring(path, lot.p);
    ctx.fill(path);
  }
  const image = { canvas, scale, minX, minZ };
  cache = { layout, image };
  return image;
}
