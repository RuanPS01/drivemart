import { create } from 'zustand';
import type { OrderWithId } from '../services/resale';

/** Pedidos em andamento do usuário logado (atualizados em tempo real). */
export interface OrderState {
  buying: OrderWithId[];
  selling: OrderWithId[];
  set: (partial: Partial<Pick<OrderState, 'buying' | 'selling'>>) => void;
}

export const useOrders = create<OrderState>((set) => ({
  buying: [],
  selling: [],
  set: (partial) => set(partial),
}));

/** Vendas que esperam uma ação do vendedor. */
export function sellerActionCount(selling: OrderWithId[]): number {
  return selling.filter((o) => o.status === 'buyer_marked_paid' || o.status === 'fee_paid').length;
}
