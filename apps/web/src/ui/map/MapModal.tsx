import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBRL, type LayoutLot } from '@drivemart/shared';
import { firebase, isOffline } from '../../services/firebase';
import { watchCityIndex, type CityIndexDoc } from '../../services/parcels';
import { useAuth } from '../../state/authStore';
import { useGame } from '../../state/gameStore';
import { useParcels } from '../../state/parcelStore';
import { useUi } from '../../state/uiStore';
import { lotSubtitle, lotTitle } from '../hud/ZoneCard';
import { Modal } from '../modals/Modal';
import { cityMapImage } from './cityMap';
import { referencePrice } from '../../services/orders';

/** Mapa da cidade em tela cheia: arrastar para mover, roda do mouse para zoom, clique num imóvel para ver ações. */
export function MapModal() {
  const engine = useGame((s) => s.engine);
  const uid = useAuth((s) => s.user?.uid ?? null);
  const close = useUi((s) => s.close);
  const toast = useUi((s) => s.toast);
  const entries = useParcels((s) => s.entries);
  const ref = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState<CityIndexDoc>({});
  const [selected, setSelected] = useState<LayoutLot | null>(null);
  const view = useRef({ cx: 0, cz: 0, zoom: 1, init: false });
  const drag = useRef<{ x: number; y: number; cx: number; cz: number; moved: boolean } | null>(null);

  const map = useMemo(() => (engine ? cityMapImage(engine.layout) : null), [engine]);

  useEffect(() => {
    if (!engine || !firebase()) return;
    return watchCityIndex(engine.layout.cityId, setIndex);
  }, [engine]);

  useEffect(() => {
    if (!engine || !map || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d')!;
    const v = view.current;
    if (!v.init) {
      const p = engine.carPosition;
      v.cx = p.x;
      v.cz = p.z;
      v.zoom = 1.2;
      v.init = true;
    }
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = (canvas.width = canvas.clientWidth);
      const h = (canvas.height = canvas.clientHeight);
      const k = v.zoom;
      ctx.fillStyle = '#0d1018';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = k < 2;
      const sx = (x: number) => w / 2 + (x - v.cx) * k;
      const sz = (z: number) => h / 2 + (z - v.cz) * k;
      ctx.drawImage(
        map.canvas,
        sx(map.minX),
        sz(map.minZ),
        (map.canvas.width / map.scale) * k,
        (map.canvas.height / map.scale) * k,
      );
      const dot = (lot: LayoutLot, color: string, r = 4) => {
        if (!lot.z) return;
        ctx.fillStyle = color;
        ctx.strokeStyle = '#000';
        ctx.beginPath();
        ctx.arc(sx(lot.z[0]), sz(lot.z[1]), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      };
      for (const id of Object.keys(index.forSale ?? {})) {
        const lot = engine.parcels.byId.get(id);
        if (lot) dot(lot, '#ffcc33');
      }
      for (const [id, owner] of Object.entries(index.owned ?? {})) {
        const lot = engine.parcels.byId.get(id);
        if (lot && uid && owner === uid) dot(lot, '#ff8c1a', 6);
      }
      if (selected) dot(selected, '#ff3df2', 7);
      // Carro.
      const p = engine.carPosition;
      const hd = engine.carHeading;
      ctx.save();
      ctx.translate(sx(p.x), sz(p.z));
      ctx.rotate(Math.PI - hd);
      ctx.fillStyle = '#ffcc33';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, 8);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine, map, index, uid, selected]);

  if (!engine) return null;

  const toWorld = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const v = view.current;
    return {
      x: v.cx + (e.clientX - r.left - r.width / 2) / v.zoom,
      z: v.cz + (e.clientY - r.top - r.height / 2) / v.zoom,
    };
  };

  const pick = (e: React.MouseEvent) => {
    const { x, z } = toWorld(e);
    const near = engine.parcels.lotsNear(x, z, 24 / view.current.zoom + 10).filter((l) => l.z);
    near.sort((a, b) => Math.hypot(a.z![0] - x, a.z![1] - z) - Math.hypot(b.z![0] - x, b.z![1] - z));
    setSelected(near[0] ?? null);
  };

  const entry = selected ? entries[selected.id] : undefined;
  const mine = !!selected && !!uid && (entry?.ou === uid || index.owned?.[selected.id] === uid);
  const salePrice = selected ? index.forSale?.[selected.id] : undefined;
  const offline = isOffline();

  return (
    <Modal title="Mapa" wide>
      <div className="map-wrap">
        <canvas
          ref={ref}
          className="map-canvas"
          onMouseDown={(e) => {
            const v = view.current;
            drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cz: v.cz, moved: false };
          }}
          onMouseMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const v = view.current;
            if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
            v.cx = d.cx - (e.clientX - d.x) / v.zoom;
            v.cz = d.cz - (e.clientY - d.y) / v.zoom;
          }}
          onMouseUp={(e) => {
            if (drag.current && !drag.current.moved) pick(e);
            drag.current = null;
          }}
          onMouseLeave={() => (drag.current = null)}
          onWheel={(e) => {
            const v = view.current;
            v.zoom = Math.min(8, Math.max(0.15, v.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
          }}
        />
        <div className="map-legend">
          <span className="lg lg-car">Você</span>
          {!offline && <span className="lg lg-mine">Seus imóveis</span>}
          {!offline && <span className="lg lg-sale">À venda (revenda)</span>}
        </div>
        {selected && (
          <div className="map-info panel">
            <strong>{lotTitle(selected, entry)}</strong>
            <span className="muted">{lotSubtitle(selected)}</span>
            {offline ? (
              <span>Preço de referência: {formatBRL(referencePrice(selected))}</span>
            ) : (
              !entry &&
              !index.owned?.[selected.id] && <span>Plataforma: {formatBRL(referencePrice(selected))}</span>
            )}
            {salePrice && <span>Revenda: {formatBRL(salePrice)}</span>}
            <div className="row">
              <button
                className="btn primary"
                onClick={() => {
                  if (engine.setRoute(selected.id)) {
                    toast('Rota traçada. Siga as setas.', 'ok');
                    close();
                  } else toast('Não encontramos um caminho até lá.', 'error');
                }}
              >
                Traçar rota
              </button>
              {/* No modo de teste dá para teleportar para qualquer imóvel. */}
              {(mine || offline) && (
                <button
                  className="btn"
                  onClick={() => {
                    engine.teleportToLot(selected.id);
                    close();
                  }}
                >
                  Teleportar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
