import { useEffect, useRef } from 'react';
import { Engine } from '../game/Engine';
import { useGame } from '../state/gameStore';
import { useUi } from '../state/uiStore';
import { loadSettings } from './modals/SettingsModal';

/** Monta o motor do jogo num canvas de tela cheia. */
export function GameCanvas({ cityId }: { cityId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const set = useGame((s) => s.set);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let engine: Engine | null = null;
    let cancelled = false;
    Engine.create(canvas, cityId, {
      progress: (progress, message) => set({ progress, message }),
      hud: (h) => set(h),
      route: (route) => set({ route }),
      arrived: () => useUi.getState().toast('Você chegou ao destino.', 'ok'),
    })
      .then((e) => {
        if (cancelled) {
          e.dispose();
          return;
        }
        engine = e;
        const saved = loadSettings();
        e.setGraphics(saved.graphics);
        e.setNight(saved.night);
        e.start();
        set({ engine: e, phase: 'ready', ...saved });
        (window as unknown as { __drivemart?: Engine }).__drivemart = e;
      })
      .catch((err: unknown) => {
        console.error(err);
        set({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
      engine?.dispose();
      set({ engine: null, phase: 'loading', progress: 0 });
    };
  }, [cityId, set]);

  return <canvas ref={ref} className="game-canvas" tabIndex={0} />;
}
