import earcut from 'earcut';

/** Grade 2D (XZ) usada para análise: máscara de ruas e calçadas, ocupação de lotes e alturas do chão. */
export class Grid {
  readonly w: number;
  readonly h: number;
  /** Código do material (0 = vazio, senão índice do material + 1). */
  readonly mat: Uint8Array;
  /** Altura do chão em decímetros. */
  readonly height: Int16Array;
  /** Ocupação por lotes (id do lote + 1). */
  readonly lot: Int32Array;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    maxX: number,
    maxZ: number,
    readonly cell = 1,
  ) {
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    this.mat = new Uint8Array(this.w * this.h);
    this.height = new Int16Array(this.w * this.h);
    this.lot = new Int32Array(this.w * this.h);
  }

  index(x: number, z: number): number {
    const i = Math.floor((x - this.minX) / this.cell);
    const j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  matAt(x: number, z: number): number {
    const i = this.index(x, z);
    return i < 0 ? 0 : this.mat[i]!;
  }

  heightAt(x: number, z: number): number {
    const i = this.index(x, z);
    return i < 0 ? 0 : this.height[i]! / 10;
  }

  lotAt(x: number, z: number): number {
    const i = this.index(x, z);
    return i < 0 ? 0 : this.lot[i]!;
  }

  /** Rasteriza um triângulo XZ chamando `cb` para cada célula cujo centro está dentro dele. */
  fillTriangle(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    cx: number,
    cz: number,
    cb: (idx: number, w0: number, w1: number, w2: number) => void,
  ): void {
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-9) return;
    const c = this.cell;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - this.minX) / c));
    const i1 = Math.min(this.w - 1, Math.floor((Math.max(ax, bx, cx) - this.minX) / c));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - this.minZ) / c));
    const j1 = Math.min(this.h - 1, Math.floor((Math.max(az, bz, cz) - this.minZ) / c));
    for (let j = j0; j <= j1; j++) {
      const pz = this.minZ + (j + 0.5) * c;
      for (let i = i0; i <= i1; i++) {
        const px = this.minX + (i + 0.5) * c;
        const w0 = ((bx - px) * (cz - pz) - (cx - px) * (bz - pz)) / area;
        const w1 = ((cx - px) * (az - pz) - (ax - px) * (cz - pz)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        cb(j * this.w + i, w0, w1, w2);
      }
    }
  }

  /** Marca a ocupação de um lote (polígono com furos opcionais, anéis XZ achatados). */
  fillLotPolygon(rings: number[][], value: number): void {
    const flat: number[] = [];
    const holes: number[] = [];
    rings.forEach((r, k) => {
      if (k > 0) holes.push(flat.length / 2);
      flat.push(...r);
    });
    const tris = earcut(flat, holes, 2);
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t]! * 2,
        b = tris[t + 1]! * 2,
        c = tris[t + 2]! * 2;
      this.fillTriangle(flat[a]!, flat[a + 1]!, flat[b]!, flat[b + 1]!, flat[c]!, flat[c + 1]!, (idx) => {
        if (!this.lot[idx]) this.lot[idx] = value;
      });
    }
  }
}
