import type { LayoutLot } from '@drivemart/shared';

/** Índice espacial dos lotes e das zonas de ação. */
export class ParcelIndex {
  readonly byId = new Map<string, LayoutLot>();
  private zoneGrid = new Map<string, LayoutLot[]>();
  private lotGrid = new Map<string, LayoutLot[]>();
  private readonly cell = 32;

  constructor(readonly lots: LayoutLot[]) {
    for (const lot of lots) {
      this.byId.set(lot.id, lot);
      const [fx, fz] = facadeCenter(lot);
      this.push(this.lotGrid, fx, fz, lot);
      if (lot.z) this.push(this.zoneGrid, lot.z[0], lot.z[1], lot);
    }
  }

  private push(grid: Map<string, LayoutLot[]>, x: number, z: number, lot: LayoutLot): void {
    const k = `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
    let l = grid.get(k);
    if (!l) grid.set(k, (l = []));
    l.push(lot);
  }

  private query(
    grid: Map<string, LayoutLot[]>,
    x: number,
    z: number,
    r: number,
    pos: (l: LayoutLot) => [number, number],
  ): LayoutLot[] {
    const out: LayoutLot[] = [];
    const c = this.cell;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++)
        for (const lot of grid.get(`${i},${j}`) ?? []) {
          const [px, pz] = pos(lot);
          if (Math.hypot(px - x, pz - z) <= r) out.push(lot);
        }
    return out;
  }

  /** Lotes com zona de ação num raio (pelo centro da zona). */
  zonesNear(x: number, z: number, r: number): LayoutLot[] {
    return this.query(this.zoneGrid, x, z, r, (l) => [l.z![0], l.z![1]]);
  }

  /** Lotes num raio (pelo centro da fachada). */
  lotsNear(x: number, z: number, r: number): LayoutLot[] {
    return this.query(this.lotGrid, x, z, r, facadeCenter);
  }
}

export function facadeCenter(lot: LayoutLot): [number, number] {
  return [(lot.f[0] + lot.f[2]) / 2, (lot.f[1] + lot.f[3]) / 2];
}

/** Coordenadas do ponto no referencial da zona: t ao longo da fachada, n para fora (rua). */
export function zoneLocal(lot: LayoutLot, x: number, z: number): { t: number; n: number } {
  const [cx, cz, , angle] = lot.z!;
  const dx = x - cx,
    dz = z - cz;
  return { t: dx * Math.cos(angle) + dz * Math.sin(angle), n: dx * lot.n[0] + dz * lot.n[1] };
}

export function insideZone(lot: LayoutLot, x: number, z: number, margin = 0): boolean {
  if (!lot.z) return false;
  const { t, n } = zoneLocal(lot, x, z);
  return Math.abs(t) <= lot.z[4] / 2 + margin && Math.abs(n) <= lot.z[5] / 2 + margin;
}
