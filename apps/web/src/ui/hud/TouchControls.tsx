import { useEffect, useState } from 'react';
import { useGame } from '../../state/gameStore';

/** Controles na tela para celular e tablet (aparecem só em telas de toque). */
export function TouchControls() {
  const engine = useGame((s) => s.engine);
  const [coarse, setCoarse] = useState(() => window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const on = () => setCoarse(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  if (!coarse || !engine) return null;

  const bind = (down: () => void, up: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      down();
    },
    onPointerUp: up,
    onPointerCancel: up,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const input = engine.input;

  return (
    <div className="touch-controls">
      <div className="touch-left">
        <button
          aria-label="Virar à esquerda"
          {...bind(
            () => input.setTouch({ steer: 1 }),
            () => input.setTouch({ steer: 0 }),
          )}
        >
          ◀
        </button>
        <button
          aria-label="Virar à direita"
          {...bind(
            () => input.setTouch({ steer: -1 }),
            () => input.setTouch({ steer: 0 }),
          )}
        >
          ▶
        </button>
      </div>
      <div className="touch-right">
        <button
          className="touch-small"
          aria-label="Freio de mão"
          {...bind(
            () => input.setTouch({ handbrake: true }),
            () => input.setTouch({ handbrake: false }),
          )}
        >
          FREIO DE MÃO
        </button>
        <button
          aria-label="Frear e ré"
          {...bind(
            () => input.setTouch({ brake: 1 }),
            () => input.setTouch({ brake: 0 }),
          )}
        >
          RÉ
        </button>
        <button
          className="touch-gas"
          aria-label="Acelerar"
          {...bind(
            () => input.setTouch({ throttle: 1 }),
            () => input.setTouch({ throttle: 0 }),
          )}
        >
          ACELERAR
        </button>
      </div>
    </div>
  );
}
