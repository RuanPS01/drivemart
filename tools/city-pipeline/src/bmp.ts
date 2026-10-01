import { readFileSync } from 'node:fs';

/** Imagem RGBA simples. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Lê BMP 24/32 bpp sem compressão (formato das páginas de textura exportadas). */
export function readBmp(path: string): Rgba {
  const b = readFileSync(path);
  if (b.toString('latin1', 0, 2) !== 'BM') throw new Error(`BMP inválido: ${path}`);
  const offset = b.readUInt32LE(10);
  const width = b.readInt32LE(18);
  const rawH = b.readInt32LE(22);
  const bpp = b.readUInt16LE(28);
  const compression = b.readUInt32LE(30);
  if (compression !== 0 || (bpp !== 32 && bpp !== 24))
    throw new Error(`BMP não suportado (${bpp} bpp): ${path}`);
  const height = Math.abs(rawH);
  const topDown = rawH < 0;
  const bytes = bpp / 8;
  const stride = Math.ceil((width * bytes) / 4) * 4;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = offset + (topDown ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * bytes;
      const d = (y * width + x) * 4;
      data[d] = b[s + 2]!;
      data[d + 1] = b[s + 1]!;
      data[d + 2] = b[s]!;
      data[d + 3] = bytes === 4 ? b[s + 3]! : 255;
    }
  }
  return { width, height, data };
}

/** Amostra a cor média (só pixels opacos) de um triângulo em coordenadas UV. */
export function sampleTriangle(
  img: Rgba,
  uv: ArrayLike<number>,
  o: number,
  steps = 4,
): [number, number, number, number] {
  let r = 0,
    g = 0,
    bl = 0,
    n = 0,
    total = 0;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps - i; j++) {
      const a = i / steps,
        c = j / steps,
        w = 1 - a - c;
      const u = uv[o]! * w + uv[o + 2]! * a + uv[o + 4]! * c;
      const v = uv[o + 1]! * w + uv[o + 3]! * a + uv[o + 5]! * c;
      // VRML: v cresce para cima; a imagem cresce para baixo.
      const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
      const y = Math.min(img.height - 1, Math.max(0, Math.floor((1 - v) * img.height)));
      const p = (y * img.width + x) * 4;
      total++;
      if (img.data[p + 3]! < 128) continue;
      r += img.data[p]!;
      g += img.data[p + 1]!;
      bl += img.data[p + 2]!;
      n++;
    }
  }
  if (!n) return [0, 0, 0, 0];
  return [r / n, g / n, bl / n, n / total];
}
