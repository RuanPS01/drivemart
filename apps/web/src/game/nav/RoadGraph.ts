import { latticeNodes, type RoadLattice } from '@drivemart/shared';

/** Grafo de ruas do traçado com busca do nó mais próximo e rota A*. */
export class RoadGraph {
  readonly count: number;
  private adj: number[][];
  private grid = new Map<string, number[]>();
  private readonly cell = 32;
  /** Componente conexo de cada nó e o id do maior (a rede principal de ruas). */
  private comp: Int32Array;
  private mainComp = 0;

  constructor(
    readonly nodes: number[],
    edges: number[],
  ) {
    this.count = nodes.length / 3;
    this.adj = Array.from({ length: this.count }, () => []);
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e]!,
        b = edges[e + 1]!;
      this.adj[a]!.push(b);
      this.adj[b]!.push(a);
    }
    this.comp = new Int32Array(this.count).fill(-1);
    let best = 0,
      bestSize = 0;
    for (let i = 0, c = 0; i < this.count; i++) {
      if (this.comp[i]! >= 0) continue;
      let size = 0;
      const stack = [i];
      this.comp[i] = c;
      while (stack.length) {
        const v = stack.pop()!;
        size++;
        for (const w of this.adj[v]!) {
          if (this.comp[w]! < 0) {
            this.comp[w] = c;
            stack.push(w);
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        best = c;
      }
      c++;
    }
    this.mainComp = best;
    for (let i = 0; i < this.count; i++) {
      const k = this.key(this.x(i), this.z(i));
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(i);
    }
  }

  /**
   * Monta o grafo a partir da grade de pistas: cada célula é um nó ligado às vizinhas
   * (diagonais só quando as duas ortogonais também são pista, para não cortar esquinas).
   */
  static fromLattice(l: RoadLattice): RoadGraph {
    const n = latticeNodes(l);
    const nodes: number[] = [];
    const edges: number[] = [];
    for (let i = 0; i < n.x.length; i++) {
      nodes.push(n.x[i]!, n.y[i]!, n.z[i]!);
      const c = n.col[i]!,
        r = n.row[i]!;
      const right = n.at(c + 1, r),
        down = n.at(c, r + 1);
      if (right) edges.push(i, right - 1);
      if (down) edges.push(i, down - 1);
      const dr = n.at(c + 1, r + 1);
      if (dr && right && down) edges.push(i, dr - 1);
      const dl = n.at(c - 1, r + 1);
      if (dl && n.at(c - 1, r) && down) edges.push(i, dl - 1);
    }
    return new RoadGraph(nodes, edges);
  }

  x(i: number): number {
    return this.nodes[i * 3]!;
  }
  y(i: number): number {
    return this.nodes[i * 3 + 1]!;
  }
  z(i: number): number {
    return this.nodes[i * 3 + 2]!;
  }
  neighbors(i: number): readonly number[] {
    return this.adj[i]!;
  }

  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }

  /** Nó mais próximo (busca em anéis crescentes da grade). Com `mainOnly`, só na rede principal. */
  nearest(x: number, z: number, maxRadius = 600, mainOnly = false): number {
    const ci = Math.floor(x / this.cell),
      cj = Math.floor(z / this.cell);
    let best = -1,
      bestD = Infinity;
    for (let r = 0; r * this.cell <= maxRadius; r++) {
      for (let i = ci - r; i <= ci + r; i++)
        for (let j = cj - r; j <= cj + r; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          for (const n of this.grid.get(`${i},${j}`) ?? []) {
            if (mainOnly && this.comp[n] !== this.mainComp) continue;
            const d = Math.hypot(this.x(n) - x, this.z(n) - z);
            if (d < bestD) {
              bestD = d;
              best = n;
            }
          }
        }
      if (best >= 0 && bestD < r * this.cell) break;
    }
    return best;
  }

  /** Rumo da rua num nó: direção do vizinho mais distante (ou 0). */
  headingAt(i: number, prefer?: number): number {
    let best = 0,
      far = -1;
    for (const n of this.adj[i]!) {
      const dx = this.x(n) - this.x(i),
        dz = this.z(n) - this.z(i);
      const h = Math.atan2(dx, dz);
      let score = Math.hypot(dx, dz);
      if (prefer !== undefined) score -= Math.abs(Math.atan2(Math.sin(h - prefer), Math.cos(h - prefer))) * 2;
      if (score > far) {
        far = score;
        best = h;
      }
    }
    return best;
  }

  /** Rota A* entre dois nós. Retorna a lista de nós (vazia se não houver caminho). */
  route(from: number, to: number, maxVisited = 60000): number[] {
    if (from < 0 || to < 0) return [];
    if (from === to) return [from];
    const g = new Map<number, number>([[from, 0]]);
    const came = new Map<number, number>();
    const tx = this.x(to),
      tz = this.z(to);
    const h = (n: number) => Math.hypot(this.x(n) - tx, this.z(n) - tz);
    const heap = new MinHeap();
    heap.push(from, h(from));
    const closed = new Set<number>();
    while (heap.size) {
      const cur = heap.pop()!;
      if (cur === to) {
        const path = [cur];
        let c = cur;
        while (came.has(c)) {
          c = came.get(c)!;
          path.push(c);
        }
        return path.reverse();
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (closed.size > maxVisited) break;
      const gc = g.get(cur)!;
      for (const n of this.adj[cur]!) {
        if (closed.has(n)) continue;
        const cost = gc + Math.hypot(this.x(n) - this.x(cur), this.z(n) - this.z(cur));
        if (cost < (g.get(n) ?? Infinity)) {
          g.set(n, cost);
          came.set(n, cur);
          heap.push(n, cost + h(n));
        }
      }
    }
    return [];
  }
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number | undefined {
    if (!this.items.length) return undefined;
    const top = this.items[0];
    const lastI = this.items.pop()!,
      lastP = this.prio.pop()!;
    if (this.items.length) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.items.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}
