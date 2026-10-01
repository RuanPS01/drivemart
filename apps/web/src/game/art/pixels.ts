/**
 * Tela de pixels em ponto flutuante usada pelos pintores de textura procedural.
 * Coordenadas fora da tela dão a volta (textura repetível nas bordas).
 */

export type Rgb = [number, number, number];

/**
 * Classes de superfície guardadas no canal alfa (lidas pelo shader):
 * - TINT: parede que recebe a cor do prédio (cor por vértice);
 * - SOLID: superfície opaca com cor própria (toldos, placas, pneus);
 * - GLOW: janelas e lâmpadas, que acendem à noite;
 * - CUT: recorte transparente (folhas, faixas de pedestre).
 */
export const A_TINT = 1;
export const A_SOLID = 200 / 255;
export const A_GLOW = 150 / 255;
export const A_CUT = 0;

export function hex(h: string): Rgb {
  const v = parseInt(h.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function shade(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export class Px {
  readonly d: Float32Array;

  constructor(
    readonly w = 128,
    readonly h = 128,
  ) {
    this.d = new Float32Array(w * h * 4);
  }

  private idx(x: number, y: number): number {
    const xx = ((Math.floor(x) % this.w) + this.w) % this.w;
    const yy = ((Math.floor(y) % this.h) + this.h) % this.h;
    return (yy * this.w + xx) * 4;
  }

  set(x: number, y: number, c: Rgb, a = A_TINT): void {
    const i = this.idx(x, y);
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = a;
  }

  get(x: number, y: number): Rgb {
    const i = this.idx(x, y);
    return [this.d[i]!, this.d[i + 1]!, this.d[i + 2]!];
  }

  alpha(x: number, y: number): number {
    return this.d[this.idx(x, y) + 3]!;
  }

  /** Mistura a cor no pixel mantendo a classe de alfa, a menos que `a` seja informado. */
  blend(x: number, y: number, c: Rgb, t: number, a?: number): void {
    const i = this.idx(x, y);
    this.d[i] = this.d[i]! + (c[0] - this.d[i]!) * t;
    this.d[i + 1] = this.d[i + 1]! + (c[1] - this.d[i + 1]!) * t;
    this.d[i + 2] = this.d[i + 2]! + (c[2] - this.d[i + 2]!) * t;
    if (a !== undefined) this.d[i + 3] = a;
  }

  fill(c: Rgb, a = A_TINT): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c, a);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb, a = A_TINT): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
    return this;
  }

  /** Contorno de retângulo com espessura `t`. */
  frame(x: number, y: number, w: number, h: number, t: number, c: Rgb, a = A_TINT): this {
    this.rect(x, y, w, t, c, a);
    this.rect(x, y + h - t, w, t, c, a);
    this.rect(x, y, t, h, c, a);
    this.rect(x + w - t, y, t, h, c, a);
    return this;
  }

  disc(cx: number, cy: number, r: number, c: Rgb, a = A_TINT): this {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c, a);
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Rgb, a = A_TINT, width = 1): this {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t,
        y = y0 + (y1 - y0) * t;
      for (let k = 0; k < width; k++) this.set(x + k, y, c, a);
    }
    return this;
  }

  /** Varia o brilho com ruído por pixel (só onde o alfa não é recorte). */
  grain(amount: number, r: () => number): this {
    for (let i = 0; i < this.d.length; i += 4) {
      if (this.d[i + 3]! === A_CUT) continue;
      const k = 1 + (r() - 0.5) * 2 * amount;
      this.d[i] = this.d[i]! * k;
      this.d[i + 1] = this.d[i + 1]! * k;
      this.d[i + 2] = this.d[i + 2]! * k;
    }
    return this;
  }

  /** Ruído de valor repetível (período `cells` por eixo) multiplicando o brilho. */
  noise(cells: number, amount: number, r: () => number): this {
    const g = new Float32Array(cells * cells).map(() => r() * 2 - 1);
    const at = (i: number, j: number) =>
      g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)]!;
    const smooth = (t: number) => t * t * (3 - 2 * t);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const fx = (x / this.w) * cells,
          fy = (y / this.h) * cells;
        const i = Math.floor(fx),
          j = Math.floor(fy);
        const tx = smooth(fx - i),
          ty = smooth(fy - j);
        const v =
          (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) +
          (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
        const p = (y * this.w + x) * 4;
        if (this.d[p + 3]! === A_CUT) continue;
        const k = 1 + v * amount;
        this.d[p] = this.d[p]! * k;
        this.d[p + 1] = this.d[p + 1]! * k;
        this.d[p + 2] = this.d[p + 2]! * k;
      }
    }
    return this;
  }

  /** Converte para RGBA 8 bits reduzindo a 5 bits por canal com dithering ordenado (visual de PS1). */
  toBytes(out: Uint8Array, offset: number, dither = true): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const p = (y * this.w + x) * 4;
        const bias = dither ? (BAYER4[(y & 3) * 4 + (x & 3)]! / 16 - 0.5) * (1 / 31) : 0;
        for (let c = 0; c < 3; c++) {
          const v = Math.min(1, Math.max(0, this.d[p + c]! + bias));
          out[offset + p + c] = Math.round(Math.round(v * 31) * (255 / 31));
        }
        out[offset + p + 3] = Math.round(this.d[p + 3]! * 255);
      }
    }
  }
}
