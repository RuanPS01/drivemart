import type { LayoutLot } from '@drivemart/shared';
import { insideZone, type ParcelIndex } from './ParcelIndex';

export interface ZoneContactState {
  lotId: string;
  stopped: boolean;
}

/** Detecta quando o carro entra numa zona de ação e quando para dentro dela. */
export class ZoneDetector {
  private current: LayoutLot | null = null;
  private stillTime = 0;

  constructor(
    private readonly index: ParcelIndex,
    readonly stopSpeed = 0.8,
    readonly stopTime = 0.6,
  ) {}

  update(x: number, z: number, speed: number, dt: number): ZoneContactState | null {
    if (this.current && !insideZone(this.current, x, z, 1)) {
      this.current = null;
      this.stillTime = 0;
    }
    if (!this.current) {
      let best: LayoutLot | null = null;
      let bestD = Infinity;
      for (const lot of this.index.zonesNear(x, z, 12)) {
        if (!insideZone(lot, x, z)) continue;
        const d = Math.hypot(lot.z![0] - x, lot.z![1] - z);
        if (d < bestD) {
          bestD = d;
          best = lot;
        }
      }
      this.current = best;
      this.stillTime = 0;
    }
    if (!this.current) return null;
    if (Math.abs(speed) < this.stopSpeed) this.stillTime += dt;
    else this.stillTime = 0;
    return { lotId: this.current.id, stopped: this.stillTime >= this.stopTime };
  }
}
