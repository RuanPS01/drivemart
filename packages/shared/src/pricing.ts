/** Parâmetros da fórmula de preço inicial dos lotes (valores em centavos de real). */
export interface PricingConfig {
  /** Preço por m² de terreno, em centavos. */
  basePerM2Cents: number;
  /** Acréscimo por andar (0,08 = 8% por andar). */
  floorFactor: number;
  /** Multiplicador para lotes de frente para a orla. */
  orlaMultiplier: number;
  /** Multiplicador global ajustável pelo admin. */
  multiplier: number;
  minCents: number;
  maxCents: number;
  /** Preço único para todos os lotes (centavos). Zero usa a fórmula acima. */
  flatCents: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  basePerM2Cents: 250,
  floorFactor: 0.08,
  orlaMultiplier: 1.6,
  multiplier: 1,
  minCents: 5_000,
  maxCents: 999_000,
  // Todos os terrenos custam R$ 1,00 (a fórmula continua disponível com flatCents = 0).
  flatCents: 100,
};

export interface LotPricingInput {
  /** Área do terreno em m². */
  area: number;
  floors: number;
  orla: boolean;
}

/** Arredonda para dezenas de reais. */
function roundToTenReais(cents: number): number {
  return Math.round(cents / 1000) * 1000;
}

/** Preço inicial de venda pela plataforma, em centavos. */
export function lotPrice(lot: LotPricingInput, cfg: PricingConfig = DEFAULT_PRICING): number {
  if (cfg.flatCents > 0) return Math.round(cfg.flatCents);
  const raw =
    lot.area *
    cfg.basePerM2Cents *
    (1 + cfg.floorFactor * Math.max(1, lot.floors)) *
    (lot.orla ? cfg.orlaMultiplier : 1) *
    cfg.multiplier;
  return Math.min(cfg.maxCents, Math.max(cfg.minCents, roundToTenReais(raw)));
}

/** Formata centavos como "R$ 1.234,56". */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Lê um valor digitado em reais ("1.234,56", "1234.56", "R$ 50") e devolve centavos.
 * Retorna nulo quando não for um número válido.
 */
export function parseBRL(input: string): number | null {
  let s = input.replace(/[R$\s]/gi, '');
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0) {
    // Formato brasileiro: ponto separa milhar e vírgula separa centavos.
    if (s.indexOf(',') !== comma || dot > comma) return null;
    s = s.slice(0, comma).replace(/\./g, '') + '.' + s.slice(comma + 1);
  } else if (dot >= 0 && s.length - dot - 1 !== 3) {
    // Um único ponto seguido de 1 ou 2 casas: separador decimal.
    s = s.slice(0, dot).replace(/\./g, '') + '.' + s.slice(dot + 1);
  } else {
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Centavos no formato para editar num campo ("1234,56"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
