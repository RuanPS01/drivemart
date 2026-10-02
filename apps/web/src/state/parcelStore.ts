import { create } from 'zustand';
import type { CityStateEntry } from '@drivemart/shared';

/** Estado de uma zona de ação em relação ao carro. */
export interface ZoneContact {
  lotId: string;
  /** true quando o carro está parado dentro da zona. */
  stopped: boolean;
}

export interface ParcelState {
  /** Estado público dos lotes não disponíveis (lote ausente = disponível). */
  entries: Record<string, CityStateEntry>;
  /** Versão incrementada a cada atualização (para quem observa fora do React). */
  version: number;
  zone: ZoneContact | null;
  setRegion: (region: string, parcels: Record<string, CityStateEntry>) => void;
  clearRegion: (region: string) => void;
  setZone: (zone: ZoneContact | null) => void;
  /** Limpa tudo (troca de cidade). */
  reset: () => void;
}

const byRegion = new Map<string, string[]>();

export const useParcels = create<ParcelState>((set) => ({
  entries: {},
  version: 0,
  zone: null,
  setRegion: (region, parcels) =>
    set((s) => {
      const entries = { ...s.entries };
      for (const id of byRegion.get(region) ?? []) delete entries[id];
      Object.assign(entries, parcels);
      byRegion.set(region, Object.keys(parcels));
      return { entries, version: s.version + 1 };
    }),
  clearRegion: (region) =>
    set((s) => {
      const entries = { ...s.entries };
      for (const id of byRegion.get(region) ?? []) delete entries[id];
      byRegion.delete(region);
      return { entries, version: s.version + 1 };
    }),
  setZone: (zone) =>
    set((s) => (s.zone?.lotId === zone?.lotId && s.zone?.stopped === zone?.stopped ? s : { zone })),
  reset: () => {
    byRegion.clear();
    set((s) => ({ entries: {}, zone: null, version: s.version + 1 }));
  },
}));
