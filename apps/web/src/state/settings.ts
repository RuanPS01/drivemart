import type { Engine, GraphicsMode, ViewDistance } from '../game/Engine';

/** Preferências do jogador, guardadas no navegador. */
export interface Settings {
  graphics: GraphicsMode;
  night: boolean;
  view: ViewDistance;
  /** Volume de 0 a 1. */
  volume: number;
  speedometer: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  graphics: 'ps1',
  night: false,
  view: 'normal',
  volume: 0.7,
  speedometer: true,
};

const KEY = 'drivemart:settings';

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return {
      graphics: s.graphics === 'sharp' ? 'sharp' : 'ps1',
      night: s.night === true,
      view: s.view === 'near' || s.view === 'far' ? s.view : 'normal',
      volume: typeof s.volume === 'number' ? Math.max(0, Math.min(1, s.volume)) : DEFAULT_SETTINGS.volume,
      speedometer: s.speedometer !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
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
