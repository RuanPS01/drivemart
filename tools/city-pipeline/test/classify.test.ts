import { describe, expect, it } from 'vitest';
import { classifyModel, groundMatFromColor } from '../src/classify';
import type { Model } from '../src/scene';

const model = (name: string, bbox: Model['bbox'], billboard = false): Model => ({
  name,
  bbox,
  billboard,
  parts: [],
  triangles: 0,
});

describe('classifyModel', () => {
  it('usa os nomes do Driver 2 quando existem', () => {
    expect(classifyModel(model('_0048_ROAD01', [0, 0, 0, 6, 0, 6]))).toEqual({ kind: 'ground', mat: 'road' });
    expect(classifyModel(model('_0054_PATH2', [0, 0, 0, 6, 0.1, 6]))).toEqual({
      kind: 'ground',
      mat: 'sidewalk',
    });
    expect(classifyModel(model('_0983_SLIGHT01', [0, 0, 0, 3, 9, 0.4]))).toEqual({
      kind: 'prop',
      prop: 'streetlight',
    });
    expect(classifyModel(model('_1150_LOW_GREY-TILE', [0, 0, 0, 13, 0, 13]))).toEqual({ kind: 'skip' });
    expect(classifyModel(model('_0041_BARRIER6O', [0, 0, 0, 0.2, 0.6, 8]))).toEqual({ kind: 'wall' });
  });

  it('decide pela geometria quando não há nome', () => {
    expect(classifyModel(model('_0710_', [0, 0, 0, 6, 0, 6])).kind).toBe('ground');
    expect(classifyModel(model('_0846_', [0, 0, 0, 0, 9.4, 6.4])).kind).toBe('building');
    expect(classifyModel(model('_0196_', [0, 0, 0, 0.2, 0.6, 6])).kind).toBe('wall');
    expect(classifyModel(model('_0500_', [0, 0, 0, 120, 30, 80])).kind).toBe('terrain');
  });

  it('classifica vegetação por tamanho', () => {
    expect(classifyModel(model('_0813_', [-3, 0, 0, 3, 17, 0], true))).toEqual({
      kind: 'tree',
      tree: 'palm',
    });
    expect(classifyModel(model('_0833_', [-4, 0, 0, 4, 10, 0], true))).toEqual({
      kind: 'tree',
      tree: 'tree',
    });
    expect(classifyModel(model('_1141_', [0, 0, 0, 0.6, 0.4, 0], true))).toEqual({
      kind: 'tree',
      tree: 'bush',
    });
  });
});

describe('groundMatFromColor', () => {
  it('reconhece mar, grama, areia, asfalto e calçada', () => {
    expect(groundMatFromColor(159, 176, 192, false)).toBe('water');
    expect(groundMatFromColor(111, 120, 69, false)).toBe('grass');
    expect(groundMatFromColor(241, 231, 194, false)).toBe('sand');
    expect(groundMatFromColor(64, 64, 62, false)).toBe('road');
    expect(groundMatFromColor(176, 169, 165, true)).toBe('sidewalk');
    expect(groundMatFromColor(177, 171, 167, false)).toBe('plaza');
  });
});
