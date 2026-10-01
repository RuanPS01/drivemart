import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readBmp, sampleTriangle, type Rgba } from './bmp';
import type { Instance, Model, Scene } from './scene';

/**
 * Cores médias por triângulo, amostradas nas texturas originais.
 * Servem só para classificar material e sugerir paleta; nenhuma textura é copiada para a saída.
 */
export class TriangleColors {
  private images = new Map<string, Rgba | null>();
  private cache = new Map<string, Float32Array>();

  constructor(private readonly dir: string) {}

  private image(name: string): Rgba | null {
    if (!this.images.has(name)) {
      const p = join(this.dir, name);
      this.images.set(name, existsSync(p) ? readBmp(p) : null);
    }
    return this.images.get(name)!;
  }

  /** 4 valores por triângulo: r, g, b (0..255) e cobertura opaca (0..1). */
  of(model: Model, partIndex: number): Float32Array {
    const key = `${model.name}#${partIndex}`;
    let c = this.cache.get(key);
    if (c) return c;
    const part = model.parts[partIndex]!;
    const nt = part.positions.length / 9;
    c = new Float32Array(nt * 4);
    const img = part.texture && part.uvs.length ? this.image(part.texture) : null;
    for (let t = 0; t < nt; t++) {
      if (img) c.set(sampleTriangle(img, part.uvs, t * 6, 3), t * 4);
      else c.set([150, 150, 150, 1], t * 4);
    }
    this.cache.set(key, c);
    return c;
  }
}

/** Triângulo em coordenadas de mundo (metros) com normal unitária e área. */
export interface WorldTri {
  /** x, y, z dos 3 vértices. */
  p: Float64Array;
  nx: number;
  ny: number;
  nz: number;
  area: number;
  /** Cor média e cobertura do triângulo. */
  r: number;
  g: number;
  b: number;
  cov: number;
}

/** Percorre os triângulos de uma instância já transformados para o mundo. */
export function forEachWorldTri(
  scene: Scene,
  inst: Instance,
  colors: TriangleColors | null,
  cb: (t: WorldTri) => void,
): void {
  const model = scene.models.get(inst.model);
  if (!model) return;
  const c = Math.cos(inst.rot),
    s = Math.sin(inst.rot);
  const tri: WorldTri = { p: new Float64Array(9), nx: 0, ny: 1, nz: 0, area: 0, r: 0, g: 0, b: 0, cov: 1 };
  model.parts.forEach((part, pi) => {
    const col = colors ? colors.of(model, pi) : null;
    const P = part.positions;
    const nt = P.length / 9;
    for (let t = 0; t < nt; t++) {
      for (let v = 0; v < 3; v++) {
        const o = t * 9 + v * 3;
        const x = P[o]!,
          y = P[o + 1]!,
          z = P[o + 2]!;
        tri.p[v * 3] = c * x + s * z + inst.x;
        tri.p[v * 3 + 1] = y + inst.y;
        tri.p[v * 3 + 2] = -s * x + c * z + inst.z;
      }
      const q = tri.p;
      const ax = q[3]! - q[0]!,
        ay = q[4]! - q[1]!,
        az = q[5]! - q[2]!;
      const bx = q[6]! - q[0]!,
        by = q[7]! - q[1]!,
        bz = q[8]! - q[2]!;
      const nx = ay * bz - az * by,
        ny = az * bx - ax * bz,
        nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-9) continue;
      tri.nx = nx / len;
      tri.ny = ny / len;
      tri.nz = nz / len;
      tri.area = len / 2;
      if (col) {
        tri.r = col[t * 4]!;
        tri.g = col[t * 4 + 1]!;
        tri.b = col[t * 4 + 2]!;
        tri.cov = col[t * 4 + 3]!;
      }
      cb(tri);
    }
  });
}
