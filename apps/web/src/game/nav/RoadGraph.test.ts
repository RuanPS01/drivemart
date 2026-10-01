import { describe, expect, it } from 'vitest';
import { RoadGraph } from './RoadGraph';

describe('RoadGraph', () => {
  // Grade 3 x 3 de nós a cada 10 m, sem a aresta central (força desvio).
  const nodes: number[] = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) nodes.push(i * 10, 0, j * 10);
  const edges = [0, 1, 1, 2, 3, 4, 4, 5, 6, 7, 7, 8, 0, 3, 3, 6, 2, 5, 5, 8];
  const g = new RoadGraph(nodes, edges);

  it('acha o nó mais próximo', () => {
    expect(g.nearest(11, 9)).toBe(4);
    expect(g.nearest(-50, -50)).toBe(0);
  });

  it('calcula rota A* pelo menor caminho', () => {
    const path = g.route(1, 7);
    expect(path[0]).toBe(1);
    expect(path[path.length - 1]).toBe(7);
    // Sem as arestas centrais, o menor caminho contorna a grade (40 m, 5 nós).
    expect(path).toHaveLength(5);
  });

  it('retorna vazio sem caminho', () => {
    const isolated = new RoadGraph([0, 0, 0, 100, 0, 100], []);
    expect(isolated.route(0, 1)).toEqual([]);
  });
});

describe('RoadGraph.fromLattice', () => {
  it('liga as células de pista vizinhas e encontra rota contornando o quarteirão', () => {
    // Grade 4 x 3 com um "quarteirão" no meio (células (1,1) e (2,1) não são pista).
    const cols = 4,
      rows = 3;
    const road = [1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1];
    const bits = new Uint8Array(2);
    road.forEach((v, k) => v && (bits[k >> 3]! |= 1 << (k & 7)));
    const count = road.filter(Boolean).length;
    const g = RoadGraph.fromLattice({
      cell: 5,
      minX: 0,
      minZ: 0,
      cols,
      rows,
      mask: Buffer.from(bits).toString('base64'),
      heights: Buffer.from(new Int8Array(count).buffer).toString('base64'),
    });
    expect(g.count).toBe(10);
    const a = g.nearest(7.5, 7.5 - 5); // célula (1,0)
    const b = g.nearest(7.5, 12.5); // célula (1,2)
    const path = g.route(a, b);
    expect(path.length).toBeGreaterThanOrEqual(3);
    for (const n of path) expect([g.z(n) !== 7.5 || g.x(n) === 2.5 || g.x(n) === 17.5]).toEqual([true]);
  });
});
