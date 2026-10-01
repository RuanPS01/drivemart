import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { REGION_SIZE, type CityStateDoc } from '@drivemart/shared';
import { useParcels } from '../state/parcelStore';
import { firebase } from './firebase';

/**
 * Mantém assinaturas nos documentos `cityState` das 9 regiões ao redor do carro.
 * Cada documento resume os lotes vendidos, à venda ou reservados daquela região.
 */
export class CityStateSync {
  private subs = new Map<string, Unsubscribe>();
  private center = '';

  constructor(private readonly cityId: string) {}

  update(x: number, z: number): void {
    const fb = firebase();
    if (!fb) return;
    const rx = Math.floor(x / REGION_SIZE),
      rz = Math.floor(z / REGION_SIZE);
    const key = `${rx},${rz}`;
    if (key === this.center) return;
    this.center = key;
    const wanted = new Set<string>();
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) wanted.add(`${this.cityId}_${rx + i}_${rz + j}`);
    const store = useParcels.getState();
    for (const [region, unsub] of this.subs) {
      if (wanted.has(region)) continue;
      unsub();
      this.subs.delete(region);
      store.clearRegion(region);
    }
    for (const region of wanted) {
      if (this.subs.has(region)) continue;
      const unsub = onSnapshot(
        doc(fb.db, 'cityState', region),
        (snap) => {
          const data = snap.data() as CityStateDoc | undefined;
          useParcels.getState().setRegion(region, data?.parcels ?? {});
        },
        (err) => console.warn('[cityState]', region, err.message),
      );
      this.subs.set(region, unsub);
    }
  }

  dispose(): void {
    for (const unsub of this.subs.values()) unsub();
    this.subs.clear();
  }
}
