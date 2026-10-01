import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fnv1a } from './math';

/**
 * IDs estáveis para os lotes: cada ID fica gravado com a posição do centro da fachada.
 * Ao rodar o pipeline de novo, um lote a até 3 m de um ID antigo reaproveita o ID,
 * para não quebrar as referências no Firestore.
 */
export class LotIds {
  private locked = new Map<string, [number, number]>();
  private used = new Set<string>();
  private hash = new Map<string, string[]>();

  constructor(
    private readonly prefix: string,
    private readonly path: string,
  ) {
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, [number, number]>;
      for (const [id, pos] of Object.entries(data)) this.add(id, pos);
    }
  }

  private key(x: number, z: number) {
    return `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
  }

  private add(id: string, pos: [number, number]) {
    this.locked.set(id, pos);
    const k = this.key(pos[0], pos[1]);
    let l = this.hash.get(k);
    if (!l) this.hash.set(k, (l = []));
    l.push(id);
  }

  assign(x: number, z: number): string {
    const ci = Math.floor(x / 8),
      cj = Math.floor(z / 8);
    let best: string | null = null;
    let bestD = 3;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const id of this.hash.get(`${ci + di},${cj + dj}`) ?? []) {
          if (this.used.has(id)) continue;
          const p = this.locked.get(id)!;
          const d = Math.hypot(p[0] - x, p[1] - z);
          if (d < bestD) {
            bestD = d;
            best = id;
          }
        }
      }
    }
    if (!best) {
      let n = 0;
      do {
        best = `${this.prefix}-${(fnv1a(`${Math.round(x)}:${Math.round(z)}:${n++}`) % 36 ** 6).toString(36).padStart(6, '0')}`;
      } while (this.locked.has(best));
      this.add(best, [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
    }
    this.used.add(best);
    return best;
  }

  /** Grava só os IDs em uso, ordenados, para diffs estáveis. */
  save(): void {
    const out: Record<string, [number, number]> = {};
    for (const id of [...this.used].sort()) out[id] = this.locked.get(id)!;
    writeFileSync(this.path, JSON.stringify(out, null, 0).replace(/\],"/g, '],\n"') + '\n');
  }
}
