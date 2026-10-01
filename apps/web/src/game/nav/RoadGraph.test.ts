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
