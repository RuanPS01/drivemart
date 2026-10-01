import { useEffect } from 'react';
import { formatBRL, type CityStateEntry, type LayoutLot } from '@drivemart/shared';
import { useAuth } from '../../state/authStore';
import { useGame } from '../../state/gameStore';
import { useOrders } from '../../state/orderStore';
import { useParcels } from '../../state/parcelStore';
import { useUi, type ModalState } from '../../state/uiStore';
import { linkDomain, openShopLink } from '../links';

export function lotTitle(lot: LayoutLot, entry?: CityStateEntry): string {
  return entry?.n || `Imóvel ${lot.s}-${lot.id.slice(-4).toUpperCase()}`;
}

export function lotSubtitle(lot: LayoutLot): string {
  return `${lot.fl} ${lot.fl === 1 ? 'andar' : 'andares'} · ${lot.a} m² · Setor ${lot.s}${lot.o ? ' · Orla' : ''}`;
}

/** Abre um modal exigindo login antes (o modal desejado abre em seguida). */
export function requireAuthThen(m: ModalState): void {
  const ui = useUi.getState();
  if (useAuth.getState().user) ui.open(m);
  else ui.open({ name: 'auth', then: m });
}

/** Cartão exibido quando o carro para numa vaga em frente a um prédio. */
export function ZoneCard() {
  const zone = useParcels((s) => s.zone);
  const entry = useParcels((s) => (s.zone ? s.entries[s.zone.lotId] : undefined));
  const engine = useGame((s) => s.engine);
  const uid = useAuth((s) => s.user?.uid ?? null);
  const modalOpen = useUi((s) => s.modal !== null);
  const myOrder = useOrders((s) => (zone ? s.buying.find((o) => o.parcelId === zone.lotId) : undefined));
  const lot = zone && engine ? engine.parcels.byId.get(zone.lotId) : undefined;

  const mine = !!entry && !!uid && entry.ou === uid;
  const primary = (): void => {
    if (!lot) return;
    if (mine) return requireAuthThen({ name: 'manage', lotId: lot.id });
    if (!entry) return requireAuthThen({ name: 'checkout', lotId: lot.id });
    if (entry.s === 'for_sale') return requireAuthThen({ name: 'resale', lotId: lot.id });
    if (entry.l) openShopLink(entry.l);
  };

  // Tecla E: entra na loja (se houver link) ou executa a ação principal.
  useEffect(() => {
    if (!engine) return;
    return engine.input.onAction((a) => {
      if (a !== 'interact' || modalOpen) return;
      const z = useParcels.getState().zone;
      if (!z?.stopped) return;
      const e = useParcels.getState().entries[z.lotId];
      if (e?.l && !(uid && e.ou === uid)) openShopLink(e.l);
      else primary();
    });
  });

  if (!zone || !lot || modalOpen) return null;
  if (!zone.stopped) {
    return <div className="zone-hint">Pare na vaga para ver o imóvel</div>;
  }

  return (
    <div className="zone-card panel" role="dialog" aria-label="Imóvel">
      <div className="zone-card-head">
        <span className={`badge badge-${badgeOf(entry, mine)}`}>{badgeText(entry, mine)}</span>
        <h2>{lotTitle(lot, entry)}</h2>
        <p className="muted">{lotSubtitle(lot)}</p>
      </div>
      {entry?.o && !mine && <p className="zone-owner">Dono: {entry.o}</p>}
      {!entry && <p className="zone-price">{formatBRL(lot.pr)}</p>}
      {entry?.s === 'for_sale' && entry.p && <p className="zone-price">{formatBRL(entry.p)}</p>}
      {entry?.s === 'reserved' && !myOrder && (
        <p className="muted">Uma compra deste imóvel está em andamento.</p>
      )}
      <div className="zone-actions">
        {entry?.l && !mine && (
          <button className="btn primary" onClick={() => openShopLink(entry.l!)}>
            Entrar na loja (E)
            <small>{linkDomain(entry.l)}</small>
          </button>
        )}
        {!entry && (
          <button className="btn primary" onClick={primary}>
            Comprar (E)
          </button>
        )}
        {entry?.s === 'for_sale' && !mine && (
          <button className="btn primary" onClick={primary}>
            Comprar de {entry.o ?? 'dono'}
          </button>
        )}
        {mine && (
          <button className="btn primary" onClick={primary}>
            Gerenciar (E)
          </button>
        )}
        {myOrder && !mine && (
          <button
            className="btn primary"
            onClick={() =>
              useUi
                .getState()
                .open(
                  myOrder.kind === 'resale'
                    ? { name: 'resale', lotId: lot.id, orderId: myOrder.id }
                    : { name: 'checkout', lotId: lot.id },
                )
            }
          >
            Continuar minha compra
          </button>
        )}
        {entry && !mine && (entry.f || entry.l) && (
          <button className="btn" onClick={() => requireAuthThen({ name: 'report', lotId: lot.id })}>
            Denunciar
          </button>
        )}
      </div>
    </div>
  );
}

function badgeOf(entry: CityStateEntry | undefined, mine: boolean): string {
  if (mine) return 'mine';
  if (!entry) return 'available';
  if (entry.s === 'for_sale') return 'sale';
  if (entry.s === 'reserved') return 'reserved';
  return entry.l ? 'shop' : 'owned';
}

function badgeText(entry: CityStateEntry | undefined, mine: boolean): string {
  if (mine) return 'Seu imóvel';
  if (!entry) return 'À venda';
  if (entry.s === 'for_sale') return 'Revenda';
  if (entry.s === 'reserved') return 'Reservado';
  return entry.l ? 'Loja' : 'Vendido';
}
