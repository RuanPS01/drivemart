import { useState } from 'react';
import { signOut } from '../../services/auth';
import { firebase } from '../../services/firebase';
import { useAuth } from '../../state/authStore';
import { sellerActionCount, useOrders } from '../../state/orderStore';
import { useUi } from '../../state/uiStore';
import { CaretIcon, GearIcon } from '../icons/Icons';

/** Barra superior: logo, botão de login sempre disponível e menu do usuário. */
export function TopBar() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const open = useUi((s) => s.open);
  const toast = useUi((s) => s.toast);
  const [menu, setMenu] = useState(false);
  const pending = useOrders((s) => sellerActionCount(s.selling));
  const online = !!firebase();

  return (
    <div className="topbar">
      <div className="logo small">
        DRIVE<span>MART</span>
      </div>
      <div className="topbar-actions">
        <button className="hud-button" onClick={() => open({ name: 'map' })} title="Mapa (M)">
          Mapa
        </button>
        {ready && !user && online && (
          <button className="hud-button accent" onClick={() => open({ name: 'auth' })}>
            Entrar
          </button>
        )}
        {user && (
          <div className="user-menu">
            <button className="hud-button" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              {user.displayName || user.email || 'Minha conta'}
              {pending > 0 && <span className="count-badge">{pending}</span>} <CaretIcon />
            </button>
            {menu && (
              <div className="user-menu-list panel" onMouseLeave={() => setMenu(false)}>
                <button onClick={() => (setMenu(false), open({ name: 'manage' }))}>
                  Meus imóveis{pending > 0 ? ` (${pending} pendente${pending > 1 ? 's' : ''})` : ''}
                </button>
                <button onClick={() => (setMenu(false), open({ name: 'settings' }))}>Configurações</button>
                {user.admin && (
                  <a href="/admin" target="_blank" rel="noopener">
                    Painel admin
                  </a>
                )}
                <button
                  onClick={() => {
                    setMenu(false);
                    void signOut().then(() => toast('Você saiu da conta.'));
                  }}
                >
                  Sair
                </button>
              </div>
            )}
          </div>
        )}
        <button
          className="hud-button"
          onClick={() => open({ name: 'settings' })}
          title="Configurações"
          aria-label="Configurações"
        >
          <GearIcon />
        </button>
      </div>
    </div>
  );
}
