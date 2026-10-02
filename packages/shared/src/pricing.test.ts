import { describe, expect, it } from 'vitest';
import { centsToInput, DEFAULT_PRICING, formatBRL, lotPrice, parseBRL } from './pricing';

describe('lotPrice', () => {
  const formula = { ...DEFAULT_PRICING, flatCents: 0 };

  it('por padrão todos os terrenos custam R$ 1,00', () => {
    expect(lotPrice({ area: 77, floors: 3, orla: false })).toBe(100);
    expect(lotPrice({ area: 100_000, floors: 20, orla: true })).toBe(100);
  });

  it('com a fórmula: aplica área, andares e orla e arredonda para dezenas de reais', () => {
    const base = lotPrice({ area: 77, floors: 3, orla: false }, formula);
    expect(base % 1000).toBe(0);
    expect(base).toBe(24_000);
    expect(lotPrice({ area: 77, floors: 3, orla: true }, formula)).toBe(38_000);
  });

  it('com a fórmula: respeita mínimo e máximo', () => {
    expect(lotPrice({ area: 1, floors: 1, orla: false }, formula)).toBe(formula.minCents);
    expect(lotPrice({ area: 100_000, floors: 20, orla: true }, formula)).toBe(formula.maxCents);
  });
});

describe('formatBRL', () => {
  it('formata em reais', () => {
    expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
});

describe('parseBRL', () => {
  it('entende os formatos digitados mais comuns', () => {
    expect(parseBRL('1.234,56')).toBe(123456);
    expect(parseBRL('R$ 50')).toBe(5000);
    expect(parseBRL('1234.5')).toBe(123450);
    expect(parseBRL('1.500')).toBe(150000);
    expect(parseBRL('10,9')).toBe(1090);
    expect(parseBRL('2.000.000')).toBe(200000000);
  });

  it('rejeita textos que não são valores', () => {
    expect(parseBRL('')).toBeNull();
    expect(parseBRL('abc')).toBeNull();
    expect(parseBRL('1,234,5')).toBeNull();
    expect(parseBRL('-5')).toBeNull();
  });

  it('volta para o formato de edição', () => {
    expect(centsToInput(123456)).toBe('1234,56');
    expect(parseBRL(centsToInput(99))).toBe(99);
  });
});
