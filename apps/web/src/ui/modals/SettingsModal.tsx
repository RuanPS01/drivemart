import { useGame } from '../../state/gameStore';
import { applySettings, saveSettings, type Settings } from '../../state/settings';
import type { GraphicsMode, ViewDistance } from '../../game/Engine';
import { Modal } from './Modal';
import { appUrl } from '../links';

export function SettingsModal() {
  const engine = useGame((s) => s.engine);
  const settings = useGame((s) => s.settings);
  const set = useGame((s) => s.set);
  const apply = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    if (engine) applySettings(engine, next);
    set({ settings: next });
    saveSettings(next);
  };
  return (
    <Modal title="Configurações">
      <div className="form">
        <label>
          Gráficos
          <select
            value={settings.graphics}
            onChange={(e) => apply({ graphics: e.target.value as GraphicsMode })}
          >
            <option value="ps1">PS1 autêntico (pixelado, vértices tremidos)</option>
            <option value="sharp">Nítido (resolução da tela)</option>
          </select>
        </label>
        <label>
          Distância de visão
          <select value={settings.view} onChange={(e) => apply({ view: e.target.value as ViewDistance })}>
            <option value="near">Curta (mais leve, bom para celular)</option>
            <option value="normal">Normal</option>
            <option value="far">Longa</option>
          </select>
        </label>
        <label>
          Volume: {Math.round(settings.volume * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => apply({ volume: Number(e.target.value) })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.night}
            onChange={(e) => apply({ night: e.target.checked })}
          />{' '}
          Cidade à noite
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.speedometer}
            onChange={(e) => apply({ speedometer: e.target.checked })}
          />{' '}
          Mostrar velocímetro
        </label>
        <p className="muted small">
          <a href={appUrl('termos')} target="_blank" rel="noopener">
            Termos de Uso
          </a>{' '}
          ·{' '}
          <a href={appUrl('privacidade')} target="_blank" rel="noopener">
            Política de Privacidade
          </a>
        </p>
      </div>
    </Modal>
  );
}
