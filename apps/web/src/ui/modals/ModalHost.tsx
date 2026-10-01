import { useEffect } from 'react';
import { useGame } from '../../state/gameStore';
import { useUi } from '../../state/uiStore';
import { AuthModal } from './AuthModal';
import { CheckoutModal } from './CheckoutModal';

/** Renderiza o modal ativo e bloqueia o carro enquanto houver um aberto. */
export function ModalHost() {
  const modal = useUi((s) => s.modal);
  const engine = useGame((s) => s.engine);

  useEffect(() => {
    engine?.setInputEnabled(!modal);
  }, [engine, modal]);

  if (!modal) return null;
  switch (modal.name) {
    case 'auth':
      return <AuthModal key="auth" />;
    case 'checkout':
      return modal.lotId ? <CheckoutModal key={`checkout-${modal.lotId}`} lotId={modal.lotId} /> : null;
    default:
      return null;
  }
}
