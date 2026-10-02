import { describe, expect, it } from 'vitest';
import { latticeNodes } from '@drivemart/shared';
import { classifyModel } from '../src/classify';
import { dominantRegion, findRegion, SF_RULES, upwardFraction } from '../src/regions';
import { buildRoadLattice } from '../src/roads';
import { Grid } from '../src/raster';
import type { Model } from '../src/scene';

/** Quad (2 triângulos) com UV apontando para o pixel (px, py) de uma página 256 x 256. */
function quad(tex: string, px: number, py: number, pts: number[][]): Model['parts'][number] {
  const [a, b, c, d] = pts as [number[], number[], number[], number[]];
  const u = px / 256,
    v = 1 - py / 256;
  return {
    texture: tex,
    positions: Float32Array.from([...a, ...b, ...c, ...a, ...c, ...d]),
    uvs: Float32Array.from([u, v, u, v, u, v, u, v, u, v, u, v]),
  };
}

function model(name: string, parts: Model['parts'], billboard = false): Model {
  const b: Model['bbox'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of parts)
    for (let i = 0; i < p.positions.length; i += 3) {
      b[0] = Math.min(b[0], p.positions[i]!);
      b[1] = Math.min(b[1], p.positions[i + 1]!);
      b[2] = Math.min(b[2], p.positions[i + 2]!);
      b[3] = Math.max(b[3], p.positions[i]!);
      b[4] = Math.max(b[4], p.positions[i + 1]!);
      b[5] = Math.max(b[5], p.positions[i + 2]!);
    }
  return { name, parts, billboard, bbox: b, triangles: parts.length * 2 };
}

describe('regras de textura do Driver 1', () => {
  it('acha a região e a parte dominante do modelo', () => {
    expect(findRegion(SF_RULES.ground, '0_0.bmp', 100, 150)?.mat).toBe('road');
    expect(findRegion(SF_RULES.ground, '2_0.bmp', 200, 40)?.mat).toBe('water');
    expect(findRegion(SF_RULES.ground, '9_0.bmp', 10, 10)).toBeUndefined();
    const m = model('model_1.wrl', [
      quad('0_0.bmp', 100, 150, [
        [0, 0, 0],
        [7.5, 0, 0],
        [7.5, 0, 7.5],
        [0, 0, 7.5],
      ]),
    ]);
    const d = dominantRegion(m)!;
    expect(d.tex).toBe('0_0.bmp');
    expect(Math.round(d.x)).toBe(100);
    expect(Math.round(d.y)).toBe(150);
  });

  it('rampa de morro conta como chão, mesmo com 1,5 m de desnível', () => {
    const ramp = model('model_9.wrl', [
      quad('0_0.bmp', 100, 150, [
        [0, 0, 0],
        [7.5, 0, 0],
        [7.5, 1.5, 7.5],
        [0, 1.5, 7.5],
      ]),
    ]);
    expect(upwardFraction(ramp)).toBeGreaterThan(0.99);
    expect(classifyModel(ramp)).toEqual({ kind: 'skip' }); // sem as regras (Driver 2), seria descartada
    expect(classifyModel(ramp, SF_RULES)).toEqual({ kind: 'ground', mat: null });
  });

  it('objetos de rua saem da textura e respeitam a altura', () => {
    const lamp = model(
      'model_195.wrl',
      [
        quad('1_0.bmp', 20, 100, [
          [0, 0, 0],
          [0.4, 0, 0],
          [0.4, 9, 0],
          [0, 9, 0],
        ]),
      ],
      true,
    );
    expect(classifyModel(lamp, SF_RULES)).toEqual({ kind: 'prop', prop: 'streetlight' });
    const barrel = model('model_188.wrl', [
      quad('48_0.bmp', 230, 80, [
        [0, 0, 0],
        [0.8, 0, 0],
        [0.8, 1.1, 0],
        [0, 1.1, 0],
      ]),
    ]);
    expect(classifyModel(barrel, SF_RULES)).toEqual({ kind: 'prop', prop: 'barrel' });
    const meter = model(
      'model_721.wrl',
      [
        quad('2_0.bmp', 47, 214, [
          [0, 0, 0],
          [0.3, 0, 0],
          [0.3, 1.7, 0],
          [0, 1.7, 0],
        ]),
      ],
      true,
    );
    expect(classifyModel(meter, SF_RULES)).toEqual({ kind: 'skip' });
  });
});

describe('grade de pistas com morros', () => {
  it('usa Int16 em decímetros quando a altura passa de 60 m e decodifica certo', () => {
    const grid = new Grid(0, 0, 10, 5, 1);
    for (let i = 0; i < grid.w * grid.h; i++) {
      grid.mat[i] = 1; // asfalto
      grid.height[i] = i % grid.w < 5 ? 1053 : -42; // 105,3 m e -4,2 m
    }
    const lattice = buildRoadLattice(grid, 5);
    expect(lattice.h16).toBe(true);
    const nodes = latticeNodes(lattice);
    expect(Array.from(nodes.y)).toEqual([105.3, -4.2].map((v) => Math.fround(v)));
  });

  it('cidade plana mantém o formato original (Int8 em meios metros)', () => {
    const grid = new Grid(0, 0, 5, 5, 1);
    grid.mat.fill(1);
    grid.height.fill(15); // 1,5 m
    const lattice = buildRoadLattice(grid, 5);
    expect(lattice.h16).toBeUndefined();
    expect(latticeNodes(lattice).y[0]).toBe(1.5);
  });
});
