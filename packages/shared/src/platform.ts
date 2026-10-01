/** Configuração da plataforma (documento `config/platform`). */
export interface PlatformConfig {
  /** Taxa da plataforma na revenda, em pontos-base (1000 = 10%). */
  resaleFeeBps: number;
  /** Validade do Pix de compra (minutos). */
  paymentMinutes: number;
  /** Prazo para o comprador marcar "já paguei o vendedor" depois da taxa (horas). */
  buyerConfirmHours: number;
  /** Prazo para o vendedor confirmar o recebimento (horas) antes de virar disputa. */
  sellerConfirmHours: number;
  /** Preço mínimo de revenda (centavos). */
  minResaleCents: number;
  /** Preço máximo de revenda (centavos). */
  maxResaleCents: number;
  /** Exige e-mail verificado para contas de e-mail e senha comprarem. */
  requireVerifiedEmail: boolean;
}

export const DEFAULT_PLATFORM: PlatformConfig = {
  resaleFeeBps: 1000,
  paymentMinutes: 30,
  buyerConfirmHours: 24,
  sellerConfirmHours: 72,
  minResaleCents: 1_000,
  maxResaleCents: 10_000_000,
  requireVerifiedEmail: true,
};

/** Divide o preço de revenda entre taxa da plataforma e valor do vendedor (centavos inteiros). */
export function splitResale(priceCents: number, feeBps: number): { fee: number; seller: number } {
  const fee = Math.round((priceCents * feeBps) / 10_000);
  return { fee, seller: priceCents - fee };
}
