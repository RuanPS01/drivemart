import { useGame } from '../../state/gameStore';

export function Speedometer() {
  const speed = useGame((s) => s.speedKmh);
  return (
    <div className="speedometer" aria-label="Velocidade">
      <strong>{Math.round(speed)}</strong>
      <span>km/h</span>
    </div>
  );
}
