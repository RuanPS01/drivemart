import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CityLayout, LayoutLot } from '@drivemart/shared';
import { buildChunk, chunkKey, facadeEdge, indexLayout, lotBox, outwardRing } from './cityGen';

const layout = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../../packages/city-data/rio/layout.json', import.meta.url)),
    'utf8',
  ),
) as CityLayout;

describe('indexLayout + buildChunk (Rio)', () => {
  const index = indexLayout(layout);

  it('indexa todos os chunks', () => {
    expect(index.keys.length).toBeGreaterThan(600);
  });

  it('gera o chunk do ponto de partida com chão, prédios e colisores válidos', () => {
    const key = chunkKey(layout.spawn[0], layout.spawn[2], layout.chunkSize);
    const t0 = performance.now();
    const c = buildChunk(index, key);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500);
    expect(c.mesh.index.length).toBeGreaterThan(300);
    expect(c.mesh.position.every(Number.isFinite)).toBe(true);
    expect(Math.max(...c.mesh.index)).toBeLessThan(c.mesh.position.length / 3);
    expect(c.colliders.groundIndex.length).toBeGreaterThan(30);
    expect(c.colliders.boxes.length % 7).toBe(0);
    expect(c.colliders.boxes.length).toBeGreaterThan(7);
  });

  it('é determinístico', () => {
    const key = index.keys[10]!;
    const a = buildChunk(index, key);
    const b = buildChunk(index, key);
    expect(Buffer.from(a.mesh.position.buffer).equals(Buffer.from(b.mesh.position.buffer))).toBe(true);
  });
});

describe('geometria dos lotes', () => {
  const lot: LayoutLot = {
    id: 'rio-teste',
    p: [6, -6, 6, 6, 18, 6, 18, -6],
    f: [6, -6, 6, 6],
    n: [-1, 0],
    y: 0,
    h: 9,
    fl: 3,
    a: 144,
    c: [150, 140, 130],
    z: null,
    o: 0,
    s: 'A1',
    pr: 1000,
  };

  it('orienta o anel para as paredes olharem para fora e acha a aresta da fachada', () => {
    const ring = outwardRing(lot.p);
    const k = facadeEdge(ring, lot.f);
    const n = ring.length / 2;
    const ax = ring[k * 2]!,
      az = ring[k * 2 + 1]!;
    const bx = ring[((k + 1) % n) * 2]!,
      bz = ring[((k + 1) % n) * 2 + 1]!;
    // Aresta da fachada fica em x = 6 e a normal (-dz, dx) aponta para -x (rua).
    expect(ax).toBeCloseTo(6);
    expect(bx).toBeCloseTo(6);
    expect(-(bz - az)).toBeLessThan(0);
  });

  it('calcula a caixa de colisão alinhada à fachada', () => {
    const [cx, cy, cz, hx, hy, hz] = lotBox(lot);
    expect(cx).toBeCloseTo(12);
    expect(cz).toBeCloseTo(0);
    expect(cy).toBeCloseTo(4.5);
    expect(hx).toBeCloseTo(6);
    expect(hy).toBeCloseTo(4.5);
    expect(hz).toBeCloseTo(6);
  });
});
