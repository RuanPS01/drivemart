import { DEFAULT_CITY, isCityId, type CityId } from '@drivemart/shared';
import type { CarChoice, Engine, GraphicsMode, ViewDistance } from '../game/Engine';

/** Preferências do jogador, guardadas no navegador. */
export interface Settings {
  graphics: GraphicsMode;
  night: boolean;
  view: ViewDistance;
  /** Volume de 0 a 1. */
  volume: number;
  speedometer: boolean;
  city: CityId;
  /** Carro escolhido em cada cidade (cada uma tem a sua frota). */
  cars: Partial<Record<CityId, CarChoice>>;
}

export const DEFAULT_SETTINGS: Settings = {
  graphics: 'ps1',
  night: false,
  view: 'normal',
  volume: 0.7,
  speedometer: true,
  city: DEFAULT_CITY,
  cars: {},
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

function parseCars(v: unknown): Settings['cars'] {
  const out: Settings['cars'] = {};
  if (!v || typeof v !== 'object') return out;
  for (const [city, choice] of Object.entries(v as Record<string, unknown>)) {
    const c = choice as Partial<CarChoice> | null;
    if (isCityId(city) && c && typeof c.id === 'string' && typeof c.color === 'number')
      out[city] = { id: c.id, color: Math.max(0, Math.floor(c.color)) };
  }
  return out;
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
      cars: parseCars(s.cars),
    };
  } catch {
    return { ...DEFAULT_SETTINGS, cars: {}, city: urlCity ?? DEFAULT_CITY };
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
  if (isCityId(engine.layout.cityId)) engine.setCar(s.cars[engine.layout.cityId]);
}
