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
}

export const DEFAULT_PRICING: PricingConfig = {
  basePerM2Cents: 250,
  floorFactor: 0.08,
  orlaMultiplier: 1.6,
  multiplier: 1,
  minCents: 5_000,
  maxCents: 999_000,
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
