import { useGame, type GraphicsMode } from '../../state/gameStore';
import { Modal } from './Modal';

const KEY = 'drivemart:settings';

export function loadSettings(): { graphics: GraphicsMode; night: boolean } {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { graphics?: GraphicsMode; night?: boolean };
    return { graphics: s.graphics === 'sharp' ? 'sharp' : 'ps1', night: s.night === true };
  } catch {
    return { graphics: 'ps1', night: false };
  }
}

function saveSettings(s: { graphics: GraphicsMode; night: boolean }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* armazenamento indisponível */
  }
}

export function SettingsModal() {
  const { engine, graphics, night, set } = useGame();
  const apply = (next: { graphics: GraphicsMode; night: boolean }) => {
    engine?.setGraphics(next.graphics);
    engine?.setNight(next.night);
    set(next);
    saveSettings(next);
  };
  return (
    <Modal title="Configurações">
      <div className="form">
        <label>
          Gráficos
          <select
            value={graphics}
            onChange={(e) => apply({ graphics: e.target.value as GraphicsMode, night })}
          >
            <option value="ps1">PS1 autêntico (pixelado, vértices tremidos)</option>
            <option value="sharp">Nítido (resolução da tela)</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={night}
            onChange={(e) => apply({ graphics, night: e.target.checked })}
          />{' '}
          Cidade à noite
        </label>
      </div>
    </Modal>
  );
}
