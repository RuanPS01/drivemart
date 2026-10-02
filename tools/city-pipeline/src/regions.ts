import type { GroundMat, PropType } from './classify';
import type { Model } from './scene';

/**
 * Regras do Driver 1, cujos modelos não têm nome: o tipo de cada peça sai da região da página de textura
 * que ela usa (asfalto, calçada, água, poste...). Só o rótulo é guardado; nenhuma textura vai para a saída.
 * Coordenadas em pixels de uma página de 256 x 256, com y crescendo para baixo.
 */
export interface TexRegion {
  tex: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GroundRegion extends TexRegion {
  mat: GroundMat;
}

export interface PropRegion extends TexRegion {
  prop: PropType | 'skip';
  /** Faixa de altura (m) em que a regra vale. */
  minH?: number;
  maxH?: number;
}

export interface TextureRules {
  ground: GroundRegion[];
  props: PropRegion[];
  /** Troca de material para triângulos sem regra (decididos pela cor média). */
  fallback?: Partial<Record<GroundMat, GroundMat>>;
}

const PAGE = 256;

/** Centro (em pixels da página) do triângulo `t` a partir das UVs. */
export function uvCenter(uvs: ArrayLike<number>, t: number): [number, number] {
  const o = t * 6;
  const u = (uvs[o]! + uvs[o + 2]! + uvs[o + 4]!) / 3;
  const v = (uvs[o + 1]! + uvs[o + 3]! + uvs[o + 5]!) / 3;
  return [u * PAGE, (1 - v) * PAGE];
}

export function findRegion<T extends TexRegion>(
  rules: readonly T[],
  tex: string | null,
  x: number,
  y: number,
): T | undefined {
  if (!tex) return undefined;
  return rules.find((r) => r.tex === tex && x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
}

/** Textura e ponto médio (ponderado por área) da parte do modelo que ocupa mais área. */
export function dominantRegion(model: Model): { tex: string; x: number; y: number } | null {
  let best: { tex: string; x: number; y: number; area: number } | null = null;
  for (const part of model.parts) {
    if (!part.texture || !part.uvs.length) continue;
    const P = part.positions;
    let area = 0,
      sx = 0,
      sy = 0;
    for (let t = 0; t < P.length / 9; t++) {
      const o = t * 9;
      const ax = P[o + 3]! - P[o]!,
        ay = P[o + 4]! - P[o + 1]!,
        az = P[o + 5]! - P[o + 2]!;
      const bx = P[o + 6]! - P[o]!,
        by = P[o + 7]! - P[o + 1]!,
        bz = P[o + 8]! - P[o + 2]!;
      const a = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
      const [x, y] = uvCenter(part.uvs, t);
      area += a;
      sx += x * a;
      sy += y * a;
    }
    if (area > 0 && (!best || area > best.area))
      best = { tex: part.texture, x: sx / area, y: sy / area, area };
  }
  return best ? { tex: best.tex, x: best.x, y: best.y } : null;
}

/** Fração da área do modelo voltada para cima (chão, rampas) em vez de paredes. */
export function upwardFraction(model: Model): number {
  let up = 0,
    all = 0;
  for (const part of model.parts) {
    const P = part.positions;
    for (let o = 0; o < P.length; o += 9) {
      const ax = P[o + 3]! - P[o]!,
        ay = P[o + 4]! - P[o + 1]!,
        az = P[o + 5]! - P[o + 2]!;
      const bx = P[o + 6]! - P[o]!,
        by = P[o + 7]! - P[o + 1]!,
        bz = P[o + 8]! - P[o + 2]!;
      const nx = ay * bz - az * by,
        ny = az * bx - ax * bz,
        nz = ax * by - ay * bx;
      const a = Math.hypot(nx, ny, nz);
      all += a;
      if (a > 0 && Math.abs(ny) / a > 0.25) up += a;
    }
  }
  return all ? up / all : 0;
}

/** San Francisco (Driver 1): regiões levantadas olhando as páginas de textura do nível. */
export const SF_RULES: TextureRules = {
  ground: [
    // Asfalto cinza-claro com faixas pintadas.
    { tex: '0_0.bmp', x0: 0, y0: 128, x1: 192, y1: 192, mat: 'road' },
    { tex: '0_0.bmp', x0: 128, y0: 192, x1: 192, y1: 256, mat: 'road' },
    { tex: '0_0.bmp', x0: 0, y0: 64, x1: 64, y1: 128, mat: 'grass' },
    // Baía.
    { tex: '2_0.bmp', x0: 128, y0: 0, x1: 256, y1: 96, mat: 'water' },
    // Placas de concreto das calçadas (com meio-fio) e piso de pedra.
    { tex: '2_0.bmp', x0: 192, y0: 96, x1: 256, y1: 224, mat: 'sidewalk' },
    { tex: '2_0.bmp', x0: 128, y0: 96, x1: 192, y1: 224, mat: 'plaza' },
    { tex: '2_0.bmp', x0: 64, y0: 176, x1: 128, y1: 256, mat: 'plaza' },
    // Rocha dos morros.
    { tex: '28_0.bmp', x0: 0, y0: 0, x1: 256, y1: 256, mat: 'dirt' },
  ],
  props: [
    { tex: '1_0.bmp', x0: 0, y0: 0, x1: 80, y1: 256, prop: 'streetlight', minH: 4 },
    { tex: '1_0.bmp', x0: 176, y0: 60, x1: 240, y1: 86, prop: 'barrier' },
    { tex: '2_0.bmp', x0: 0, y0: 176, x1: 32, y1: 256, prop: 'trafficlight', minH: 2.5 },
    { tex: '2_0.bmp', x0: 32, y0: 176, x1: 64, y1: 256, prop: 'skip' },
    { tex: '48_0.bmp', x0: 208, y0: 48, x1: 256, y1: 112, prop: 'barrel', maxH: 2 },
    { tex: '48_0.bmp', x0: 80, y0: 176, x1: 112, y1: 224, prop: 'barrel', maxH: 2 },
    { tex: '48_0.bmp', x0: 64, y0: 112, x1: 128, y1: 176, prop: 'box', maxH: 1.6 },
    // Placas de PARE e mão única, telefone público e pneus: sem modelo próprio.
    { tex: '48_0.bmp', x0: 0, y0: 48, x1: 256, y1: 256, prop: 'skip', maxH: 3 },
  ],
  // Não há praia nesta cidade: pisos bege sem regra são calçamento.
  fallback: { sand: 'plaza' },
};
