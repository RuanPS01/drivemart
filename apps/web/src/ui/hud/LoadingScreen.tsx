import { useGame } from '../../state/gameStore';

export function LoadingScreen() {
  const { phase, progress, message, error } = useGame();
  if (phase === 'ready') return null;
  return (
    <div className="loading">
      <div className="loading-box">
        <h1 className="logo">
          DRIVE<span>MART</span>
        </h1>
        {phase === 'error' ? (
          <p className="loading-error">Não foi possível iniciar o jogo: {error}</p>
        ) : (
          <>
            <div className="loading-bar">
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p>{message}</p>
          </>
        )}
      </div>
    </div>
  );
}
