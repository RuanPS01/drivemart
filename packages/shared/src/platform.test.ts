import { describe, expect, it } from 'vitest';
import { splitResale } from './platform';

describe('splitResale', () => {
  it('separa 10% para a plataforma em centavos inteiros', () => {
    expect(splitResale(100_000, 1000)).toEqual({ fee: 10_000, seller: 90_000 });
    expect(splitResale(12_345, 1000)).toEqual({ fee: 1_235, seller: 11_110 });
  });
});
