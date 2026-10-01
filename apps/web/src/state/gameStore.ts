import { create } from 'zustand';
import type { Engine } from '../game/Engine';

export type GraphicsMode = 'ps1' | 'sharp';

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
  night: boolean;
  graphics: GraphicsMode;
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
  night: false,
  graphics: 'ps1',
  set: (partial) => set(partial),
}));
