import { useGame } from '../../state/gameStore';

export function Speedometer() {
  const speed = useGame((s) => s.speedKmh);
  const visible = useGame((s) => s.settings.speedometer);
  if (!visible) return null;
  return (
    <div className="speedometer" aria-label="Velocidade">
      <strong>{Math.round(speed)}</strong>
      <span>km/h</span>
    </div>
  );
}
