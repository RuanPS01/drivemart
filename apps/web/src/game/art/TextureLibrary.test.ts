import { describe, expect, it } from 'vitest';
import { LAYER, LAYER_NAMES, LAYER_SIZE, paintLayers } from './TextureLibrary';

const size = LAYER_SIZE * LAYER_SIZE * 4;

function layerStats(data: Uint8Array, idx: number) {
  let cut = 0,
    sum = 0;
  for (let p = idx * size; p < (idx + 1) * size; p += 4) {
    if (data[p + 3] === 0) cut++;
    sum += data[p]! + data[p + 1]! + data[p + 2]!;
  }
  return { cut, sum };
}

describe('paintLayers', () => {
  const data = paintLayers();

  it('gera todas as camadas com conteúdo', () => {
    expect(data.length).toBe(size * LAYER_NAMES.length);
    for (let i = 0; i < LAYER_NAMES.length; i++) expect(layerStats(data, i).sum).toBeGreaterThan(0);
  });

  it('é determinístico', () => {
    const again = paintLayers();
    expect(Buffer.from(again).equals(Buffer.from(data))).toBe(true);
  });

  it('usa recorte só nas camadas que precisam', () => {
    expect(layerStats(data, LAYER.palm).cut).toBeGreaterThan(1000);
    expect(layerStats(data, LAYER.crosswalk).cut).toBeGreaterThan(1000);
    expect(layerStats(data, LAYER.asphalt).cut).toBe(0);
    expect(layerStats(data, LAYER.facadeConcrete).cut).toBe(0);
  });

  it('reduz as cores a 15 bits (5 bits por canal)', () => {
    const allowed = new Set(Array.from({ length: 32 }, (_, i) => Math.round(i * (255 / 31))));
    for (let p = 0; p < size; p += 4) expect(allowed.has(data[p]!)).toBe(true);
  });
});
