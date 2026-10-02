import { useEffect } from 'react';
import { initAuth } from './services/auth';
import { useGame } from './state/gameStore';
import { useUi } from './state/uiStore';
import { GameCanvas } from './ui/GameCanvas';
import { ControlsHelp } from './ui/hud/ControlsHelp';
import { LoadingScreen } from './ui/hud/LoadingScreen';
import { Speedometer } from './ui/hud/Speedometer';
import { Toasts } from './ui/hud/Toasts';
import { TopBar } from './ui/hud/TopBar';
import { TouchControls } from './ui/hud/TouchControls';
import { ZoneCard } from './ui/hud/ZoneCard';
import { ModalHost } from './ui/modals/ModalHost';
import { Minimap } from './ui/map/Minimap';
import { RouteBanner } from './ui/hud/RouteBanner';
import { useOrderWatch } from './ui/useOrderWatch';

export function App() {
  const ready = useGame((s) => s.phase === 'ready');
  const city = useGame((s) => s.settings.city);
  const engine = useGame((s) => s.engine);

  useEffect(() => initAuth(), []);
  useOrderWatch();

  // Atalhos globais do teclado e do gamepad.
  useEffect(() => {
    if (!engine) return;
    return engine.input.onAction((a) => {
      const ui = useUi.getState();
      if (a === 'menu' && ui.modal) ui.close();
      else if (a === 'map' && !ui.modal) ui.open({ name: 'map' });
    });
  }, [engine]);

  return (
    <div className="app">
      {/* A chave recria o canvas e o motor ao trocar de cidade. */}
      <GameCanvas key={city} cityId={city} />
      {ready && (
        <div className="hud">
          <TopBar />
          <Speedometer />
          <Minimap />
          <RouteBanner />
          <ControlsHelp />
          <TouchControls />
          <ZoneCard />
        </div>
      )}
      <ModalHost />
      <Toasts />
      <LoadingScreen />
    </div>
  );
}
