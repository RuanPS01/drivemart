import type { CarSlice } from '@drivemart/shared';
import { describe, expect, it } from 'vitest';
import { sfCars } from '../src/carArchetypes';
import { smoothSlices } from '../src/cars';

const slice = (z: number, roof: number, halfWidth = 0.9): CarSlice => ({
  z,
  bottom: 0.3,
  belt: Math.min(0.8, roof),
  roof,
  halfWidth,
  roofHalfWidth: halfWidth * 0.8,
});

describe('smoothSlices', () => {
  it('tira picos de até duas fatias e mantém degraus e a queda na ponta', () => {
    const roofs = [0.8, 0.8, 0.8, 0.8, 2.6, 2.6, 0.8, 0.8, 0.8, 1.3, 1.3, 1.3, 1.3, 0.9];
    const s = roofs.map((r, i) => slice(i * 0.3, r));
    s[2]!.halfWidth = 0.2;
    smoothSlices(s);
    expect(s.map((x) => x.roof)).toEqual([
      0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1.3, 1.3, 1.3, 1.3, 0.9,
    ]);
    expect(s[2]!.halfWidth).toBeGreaterThan(0.7);
    for (const x of s) {
      expect(x.belt).toBeLessThanOrEqual(x.roof);
      expect(x.roofHalfWidth).toBeLessThanOrEqual(x.halfWidth);
    }
  });
});

describe('sfCars', () => {
  it('perfis dos anos 70 com eixos dentro do carro e cabine mais estreita que a carroceria', () => {
    const cars = sfCars();
    expect(cars.map((c) => c.id)).toContain('sf-taxi');
    for (const c of cars) {
      expect(c.wheels.axles.every((a) => Math.abs(a) < c.length / 2)).toBe(true);
      for (const s of c.slices) {
        expect(s.belt).toBeLessThanOrEqual(s.roof);
        expect(s.roofHalfWidth).toBeLessThanOrEqual(s.halfWidth);
        expect(s.halfWidth * 2).toBeLessThanOrEqual(c.width + 1e-9);
      }
    }
  });
});
