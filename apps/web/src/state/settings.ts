import { DEFAULT_CITY, isCityId, type CityId } from '@drivemart/shared';
import type { Engine, GraphicsMode, ViewDistance } from '../game/Engine';

/** Preferências do jogador, guardadas no navegador. */
export interface Settings {
  graphics: GraphicsMode;
  night: boolean;
  view: ViewDistance;
  /** Volume de 0 a 1. */
  volume: number;
  speedometer: boolean;
  city: CityId;
}

export const DEFAULT_SETTINGS: Settings = {
  graphics: 'ps1',
  night: false,
  view: 'normal',
  volume: 0.7,
  speedometer: true,
  city: DEFAULT_CITY,
};

const KEY = 'drivemart:settings';

/** Cidade pedida no endereço (?cidade=sf), que tem prioridade sobre a salva. */
function cityFromUrl(): CityId | null {
  try {
    const c = new URLSearchParams(window.location.search).get('cidade');
    return isCityId(c) ? c : null;
  } catch {
    return null;
  }
}

/** Mantém a cidade no endereço, para o link abrir direto nela. */
export function syncCityUrl(city: CityId): void {
  try {
    const url = new URL(window.location.href);
    if (city === DEFAULT_CITY) url.searchParams.delete('cidade');
    else url.searchParams.set('cidade', city);
    window.history.replaceState(null, '', url);
  } catch {
    /* sem histórico (ex.: testes) */
  }
}

export function loadSettings(): Settings {
  const urlCity = cityFromUrl();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return {
      city: urlCity ?? (isCityId(s.city) ? s.city : DEFAULT_CITY),
      graphics: s.graphics === 'sharp' ? 'sharp' : 'ps1',
      night: s.night === true,
      view: s.view === 'near' || s.view === 'far' ? s.view : 'normal',
      volume: typeof s.volume === 'number' ? Math.max(0, Math.min(1, s.volume)) : DEFAULT_SETTINGS.volume,
      speedometer: s.speedometer !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, city: urlCity ?? DEFAULT_CITY };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* armazenamento indisponível */
  }
}

export function applySettings(engine: Engine, s: Settings): void {
  engine.setGraphics(s.graphics);
  engine.setNight(s.night);
  engine.setViewDistance(s.view);
  engine.setVolume(s.volume);
}
