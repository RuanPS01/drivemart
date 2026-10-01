import { GameCanvas } from './ui/GameCanvas';
import { ControlsHelp } from './ui/hud/ControlsHelp';
import { LoadingScreen } from './ui/hud/LoadingScreen';
import { Speedometer } from './ui/hud/Speedometer';
import { TouchControls } from './ui/hud/TouchControls';
import { ZoneCard } from './ui/hud/ZoneCard';
import { useGame } from './state/gameStore';

export function App() {
  const ready = useGame((s) => s.phase === 'ready');
  return (
    <div className="app">
      <GameCanvas cityId="rio" />
      {ready && (
        <div className="hud">
          <Speedometer />
          <ControlsHelp />
          <TouchControls />
          <ZoneCard />
        </div>
      )}
      <LoadingScreen />
    </div>
  );
}
