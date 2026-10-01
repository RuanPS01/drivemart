import type { ModelClass } from './classify';
import type { Scene } from './scene';
import { forEachWorldTri } from './world';

export interface RoadGraph {
  /** x, y, z por nó. */
  nodes: number[];
  /** Pares de índices de nós. */
  edges: number[];
}

/** Grafo de ruas: um nó por peça de rua (centro da superfície), arestas entre peças vizinhas. */
export function buildRoadGraph(scene: Scene, classes: Map<string, ModelClass>): RoadGraph {
  type N = { x: number; y: number; z: number; size: number };
  const nodes: N[] = [];
  for (const inst of scene.instances) {
    const cls = classes.get(inst.model);
    if (!cls || cls.kind !== 'ground' || cls.mat !== 'road') continue;
    let ax = 0,
      ay = 0,
      az = 0,
      wsum = 0;
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    forEachWorldTri(scene, inst, null, (t) => {
      if (t.ny < 0.5) return;
      const p = t.p;
      ax += ((p[0]! + p[3]! + p[6]!) / 3) * t.area;
      ay += ((p[1]! + p[4]! + p[7]!) / 3) * t.area;
      az += ((p[2]! + p[5]! + p[8]!) / 3) * t.area;
      wsum += t.area;
      x0 = Math.min(x0, p[0]!, p[3]!, p[6]!);
      x1 = Math.max(x1, p[0]!, p[3]!, p[6]!);
      z0 = Math.min(z0, p[2]!, p[5]!, p[8]!);
      z1 = Math.max(z1, p[2]!, p[5]!, p[8]!);
    });
    if (wsum < 1) continue;
    nodes.push({ x: ax / wsum, y: ay / wsum, z: az / wsum, size: Math.max(x1 - x0, z1 - z0) });
  }

  const cell = 12;
  const hash = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const k = `${Math.floor(n.x / cell)},${Math.floor(n.z / cell)}`;
    let l = hash.get(k);
    if (!l) hash.set(k, (l = []));
    l.push(i);
  });
  const edges: number[] = [];
  nodes.forEach((n, i) => {
    const ci = Math.floor(n.x / cell),
      cj = Math.floor(n.z / cell);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const j of hash.get(`${ci + di},${cj + dj}`) ?? []) {
          if (j <= i) continue;
          const m = nodes[j]!;
          const d = Math.hypot(m.x - n.x, m.z - n.z);
          if (d <= 0.62 * (n.size + m.size) && Math.abs(m.y - n.y) < 1.5) edges.push(i, j);
        }
      }
    }
  });
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { nodes: nodes.flatMap((n) => [r2(n.x), r2(n.y), r2(n.z)]), edges };
}
