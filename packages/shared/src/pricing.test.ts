import { describe, expect, it } from 'vitest';
import { DEFAULT_PRICING, formatBRL, lotPrice } from './pricing';

describe('lotPrice', () => {
  it('aplica área, andares e orla e arredonda para dezenas de reais', () => {
    const base = lotPrice({ area: 77, floors: 3, orla: false });
    expect(base % 1000).toBe(0);
    expect(base).toBe(24_000);
    expect(lotPrice({ area: 77, floors: 3, orla: true })).toBe(38_000);
  });

  it('respeita mínimo e máximo', () => {
    expect(lotPrice({ area: 1, floors: 1, orla: false })).toBe(DEFAULT_PRICING.minCents);
    expect(lotPrice({ area: 100_000, floors: 20, orla: true })).toBe(DEFAULT_PRICING.maxCents);
  });
});

describe('formatBRL', () => {
  it('formata em reais', () => {
    expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
});
