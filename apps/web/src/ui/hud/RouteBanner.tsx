import { useGame } from '../../state/gameStore';
import { useParcels } from '../../state/parcelStore';
import { lotTitle } from './ZoneCard';

/** Faixa com o destino do GPS e a distância restante. */
export function RouteBanner() {
  const route = useGame((s) => s.route);
  const engine = useGame((s) => s.engine);
  const entry = useParcels((s) => (route ? s.entries[route.lotId] : undefined));
  if (!route || !engine) return null;
  const lot = engine.parcels.byId.get(route.lotId);
  const km =
    route.distance >= 1000
      ? `${(route.distance / 1000).toFixed(1).replace('.', ',')} km`
      : `${Math.round(route.distance)} m`;
  return (
    <div className="route-banner">
      <span>
        Rota para <strong>{lot ? lotTitle(lot, entry) : route.lotId}</strong> · {km}
      </span>
      <button className="link" onClick={() => engine.setRoute(null)}>
        Cancelar
      </button>
    </div>
  );
}
