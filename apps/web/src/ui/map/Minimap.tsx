import { useEffect, useRef } from 'react';
import { useGame } from '../../state/gameStore';
import { useParcels } from '../../state/parcelStore';
import { useAuth } from '../../state/authStore';
import { cityMapImage } from './cityMap';

const SIZE = 180;
/** Metros visíveis do centro até a borda. */
const RANGE = 160;

/** Minimapa giratório no canto da tela (a frente do carro fica para cima). */
export function Minimap() {
  const engine = useGame((s) => s.engine);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!engine || !ref.current) return;
    const map = cityMapImage(engine.layout);
    const ctx = ref.current.getContext('2d')!;
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 66) return;
      last = t;
      const pos = engine.carPosition;
      const heading = engine.carHeading;
      const k = SIZE / 2 / RANGE;
      ctx.save();
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#0d1018';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.translate(SIZE / 2, SIZE / 2);
      // Frente do carro para cima: gira o mundo pelo rumo (rotação pura, sem espelhar).
      ctx.rotate(heading + Math.PI);
      const s = k / map.scale;
      ctx.drawImage(
        map.canvas,
        -(pos.x - map.minX) * map.scale * s,
        -(pos.z - map.minZ) * map.scale * s,
        map.canvas.width * s,
        map.canvas.height * s,
      );
      // Marcadores de imóveis próximos (seus e à venda).
      const entries = useParcels.getState().entries;
      const uid = useAuth.getState().user?.uid;
      for (const [id, e] of Object.entries(entries)) {
        const lot = engine.parcels.byId.get(id);
        if (!lot?.z) continue;
        const dx = (lot.z[0] - pos.x) * k,
          dz = (lot.z[1] - pos.z) * k;
        if (Math.abs(dx) > SIZE || Math.abs(dz) > SIZE) continue;
        ctx.fillStyle =
          uid && e.ou === uid ? '#ff8c1a' : e.s === 'for_sale' ? '#ffcc33' : e.l ? '#4fb3ff' : '#b0b8c8';
        ctx.fillRect(dx - 3, dz - 3, 6, 6);
      }
      ctx.restore();
      // Seta do jogador.
      ctx.save();
      ctx.translate(SIZE / 2, SIZE / 2);
      ctx.fillStyle = '#ffcc33';
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6, 7);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return <canvas ref={ref} className="minimap" width={SIZE} height={SIZE} aria-label="Minimapa" />;
}
