import { useEffect } from 'react';
import { isOffline } from '../../services/firebase';
import { useGame } from '../../state/gameStore';
import { useUi } from '../../state/uiStore';
import { AuthModal } from './AuthModal';
import { CheckoutModal } from './CheckoutModal';
import { ManageModal } from './ManageModal';
import { ReportModal } from './ReportModal';
import { ResaleModal } from './ResaleModal';
import { SettingsModal } from './SettingsModal';
import { MapModal } from '../map/MapModal';

/** Renderiza o modal ativo e bloqueia o carro enquanto houver um aberto. */
export function ModalHost() {
  const modal = useUi((s) => s.modal);
  const engine = useGame((s) => s.engine);

  useEffect(() => {
    engine?.setInputEnabled(!modal);
  }, [engine, modal]);

  if (!modal) return null;
  // Modo de teste: só mapa e configurações; login e comércio dependem do Firebase.
  if (isOffline() && modal.name !== 'map' && modal.name !== 'settings') return null;
  switch (modal.name) {
    case 'auth':
      return <AuthModal key="auth" />;
    case 'checkout':
      return modal.lotId ? <CheckoutModal key={`checkout-${modal.lotId}`} lotId={modal.lotId} /> : null;
    case 'manage':
      return <ManageModal key="manage" lotId={modal.lotId} />;
    case 'map':
      return <MapModal key="map" />;
    case 'settings':
      return <SettingsModal key="settings" />;
    case 'resale':
      return modal.lotId ? (
        <ResaleModal key={`resale-${modal.lotId}`} lotId={modal.lotId} orderId={modal.orderId} />
      ) : null;
    case 'report':
      return modal.lotId ? <ReportModal key={`report-${modal.lotId}`} lotId={modal.lotId} /> : null;
    default:
      return null;
  }
}
