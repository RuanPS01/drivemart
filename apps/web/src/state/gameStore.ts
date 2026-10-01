import { create } from 'zustand';
import type { Engine } from '../game/Engine';
import type { RouteState } from '../game/nav/RouteGuide';
import { loadSettings, type Settings } from './settings';

export type { GraphicsMode } from '../game/Engine';

export interface GameState {
  phase: 'loading' | 'ready' | 'error';
  progress: number;
  message: string;
  error: string | null;
  engine: Engine | null;
  speedKmh: number;
  heading: number;
  position: [number, number];
  cameraMode: string;
  settings: Settings;
  route: RouteState | null;
  set: (partial: Partial<GameState>) => void;
}

export const useGame = create<GameState>((set) => ({
  phase: 'loading',
  progress: 0,
  message: 'Preparando...',
  error: null,
  engine: null,
  speedKmh: 0,
  heading: 0,
  position: [0, 0],
  cameraMode: 'chase',
  settings: loadSettings(),
  route: null,
  set: (partial) => set(partial),
}));
