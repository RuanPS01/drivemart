import { describe, expect, it } from 'vitest';
import { canTransition, centsToDecimal } from './order';

describe('máquina de estados dos pedidos', () => {
  it('permite o caminho feliz da compra e da revenda', () => {
    expect(canTransition('pending_payment', 'completed')).toBe(true);
    expect(canTransition('pending_payment', 'fee_paid')).toBe(true);
    expect(canTransition('fee_paid', 'buyer_marked_paid')).toBe(true);
    expect(canTransition('buyer_marked_paid', 'completed')).toBe(true);
  });

  it('bloqueia voltar de estados finais', () => {
    expect(canTransition('completed', 'pending_payment')).toBe(false);
    expect(canTransition('refunded', 'completed')).toBe(false);
    expect(canTransition('expired', 'completed')).toBe(false);
  });

  it('formata centavos para a API', () => {
    expect(centsToDecimal(12345)).toBe('123.45');
    expect(centsToDecimal(5000)).toBe('50.00');
  });
});
