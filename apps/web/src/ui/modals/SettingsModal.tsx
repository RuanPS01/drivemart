import { CITY_LIST, type CityId } from '@drivemart/shared';
import { chooseCity } from '../../state/city';
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
  // Frota da cidade atual (cada cidade tem a sua) e o carro escolhido nela.
  const cars = engine?.cars ?? [];
  const choice = settings.cars[settings.city] ?? engine?.carChoice;
  const car = cars.find((c) => c.id === choice?.id) ?? cars[0];
  const colorIndex = car && choice?.id === car.id ? Math.min(choice.color, car.colors.length - 1) : 0;
  const chooseCar = (id: string, color: number) =>
    apply({ cars: { ...settings.cars, [settings.city]: { id, color } } });
  return (
    <Modal title="Configurações">
      <div className="form">
        <label>
          Cidade
          <select value={settings.city} onChange={(e) => chooseCity(e.target.value as CityId)}>
            {CITY_LIST.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {car && (
          <label>
            Carro
            <select value={car.id} onChange={(e) => chooseCar(e.target.value, 0)}>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {car && car.colors.length > 1 && (
          <div className="field">
            <span className="field-label">Cor</span>
            <div className="swatches" role="radiogroup" aria-label="Cor do carro">
              {car.colors.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={i === colorIndex}
                  aria-label={`Cor ${i + 1}`}
                  className={i === colorIndex ? 'swatch on' : 'swatch'}
                  style={{ background: `rgb(${c.join(',')})` }}
                  onClick={() => chooseCar(car.id, i)}
                />
              ))}
            </div>
          </div>
        )}
        <label>
          Gráficos
          <select
            value={settings.graphics}
            onChange={(e) => apply({ graphics: e.target.value as GraphicsMode })}
          >
            <option value="ps1">PS1 (pixelado)</option>
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
