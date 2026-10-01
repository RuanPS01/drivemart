import { useEffect } from 'react';
import { formatBRL } from '@drivemart/shared';
import { firebase } from '../services/firebase';
import { watchBuyerOrders, watchSellerOrders } from '../services/resale';
import { useAuth } from '../state/authStore';
import { useOrders } from '../state/orderStore';
import { useUi } from '../state/uiStore';

/** Acompanha os pedidos em andamento do usuário e avisa o vendedor quando o comprador diz que pagou. */
export function useOrderWatch(): void {
  const uid = useAuth((s) => s.user?.uid ?? null);

  useEffect(() => {
    const store = useOrders.getState();
    if (!uid || !firebase()) {
      store.set({ buying: [], selling: [] });
      return;
    }
    const seen = new Set<string>();
    let first = true;
    const stopBuying = watchBuyerOrders(uid, (buying) => useOrders.getState().set({ buying }));
    const stopSelling = watchSellerOrders(uid, (selling) => {
      for (const o of selling) {
        const key = `${o.id}:${o.status}`;
        if (!first && !seen.has(key) && o.status === 'buyer_marked_paid') {
          useUi
            .getState()
            .toast(
              `${o.buyerName} informou que pagou ${formatBRL(o.sellerAmount)} pelo seu imóvel. Confira e confirme em Meus imóveis.`,
            );
        }
        seen.add(key);
      }
      first = false;
      useOrders.getState().set({ selling });
    });
    return () => {
      stopBuying();
      stopSelling();
    };
  }, [uid]);
}
