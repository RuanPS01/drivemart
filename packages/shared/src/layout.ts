/**
 * Formato do traçado de cidade (`packages/city-data/<cidade>/layout.json`).
 * Contém só números derivados dos níveis originais: polígonos de chão, lotes, paredes, props, árvores e ruas.
 * Toda a geometria visível é gerada pelo jogo a partir destes dados.
 */

export const LAYOUT_VERSION = 1;

export const GROUND_MATERIAL_NAMES = ['road', 'sidewalk', 'plaza', 'sand', 'dirt', 'grass', 'water'] as const;
export type GroundMaterialName = (typeof GROUND_MATERIAL_NAMES)[number];

export interface LayoutGroundPoly {
  /** Índice em `materials`. */
  m: number;
  /** Altura do polígono (m). */
  y: number;
  /** Anéis x, z achatados: o primeiro é o externo, os demais são furos. */
  r: number[][];
}

export interface LayoutChunk {
  g: LayoutGroundPoly[];
  /** Triângulos inclinados: material + 9 coordenadas (10 números por triângulo). */
  s?: number[];
}

/** Zona de ação: [x, z, y, ângulo da fachada, largura, profundidade]. */
export type LayoutZone = [number, number, number, number, number, number];

export interface LayoutLot {
  id: string;
  /** Terreno: anel x, z achatado. */
  p: number[];
  /** Fachada: [x0, z0, x1, z1]. */
  f: [number, number, number, number];
  /** Normal da fachada (aponta para a rua). */
  n: [number, number];
  /** Altura da base (m). */
  y: number;
  /** Altura do prédio (m). */
  h: number;
  /** Andares. */
  fl: number;
  /** Área do terreno (m²). */
  a: number;
  /** Cor dominante da fachada original (dica de paleta). */
  c: [number, number, number];
  /** Zona de ação; nulo quando o lote não tem rua alcançável (não pode ser comprado). */
  z: LayoutZone | null;
  /** 1 se fica de frente para a orla. */
  o: 0 | 1;
  /** Setor (grade de 500 m). */
  s: string;
  /** Preço base em centavos. */
  pr: number;
}

export interface CityLayout {
  version: number;
  cityId: string;
  name: string;
  source: string;
  chunkSize: number;
  /** [minX, minZ, maxX, maxZ] em metros. */
  bounds: [number, number, number, number];
  /** [x, y, z, rumo em radianos]. */
  spawn: [number, number, number, number];
  materials: string[];
  propTypes: string[];
  treeTypes: string[];
  chunks: Record<string, LayoutChunk>;
  lots: LayoutLot[];
  /** Paredes sem lote: x0, z0, x1, z1, y, h, r, g, b (9 números por parede). */
  walls: number[];
  /** Muretas e grades: x0, z0, x1, z1, y, h (6 números por mureta). */
  lowWalls: number[];
  /** Props: tipo, x, y, z, rot (5 números por prop). */
  props: number[];
  /** Árvores: tipo, x, y, z, altura (5 números por árvore). */
  trees: number[];
  /** Grade de ruas (células de pista), usada no GPS e para voltar à rua. */
  roads: RoadLattice;
}

/**
 * Grade de pistas: bitmap linha a linha (1 bit por célula, base64) e altura de cada célula de pista
 * na mesma ordem das células marcadas: em meios metros (Int8 em base64) ou, com `h16`, em decímetros
 * (Int16 little-endian em base64), para cidades com morros acima de 60 m.
 */
export interface RoadLattice {
  cell: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  mask: string;
  heights: string;
  h16?: boolean;
}

export const WALL_STRIDE = 9;
export const LOW_WALL_STRIDE = 6;
export const PROP_STRIDE = 5;
export const TREE_STRIDE = 5;
export const SLOPE_STRIDE = 10;

/** Tamanho (m) das regiões usadas para sincronizar o estado dos lotes (documentos `cityState`). */
export const REGION_SIZE = 512;

/** Chave da região de um ponto: `<cidade>_<rx>_<rz>`. */
export function regionKey(cityId: string, x: number, z: number): string {
  return `${cityId}_${Math.floor(x / REGION_SIZE)}_${Math.floor(z / REGION_SIZE)}`;
}

/** Ponto de referência de um lote: centro da zona de ação ou, sem zona, centro da fachada. */
export function lotAnchor(lot: LayoutLot): [number, number] {
  if (lot.z) return [lot.z[0], lot.z[1]];
  return [(lot.f[0] + lot.f[2]) / 2, (lot.f[1] + lot.f[3]) / 2];
}

export interface LatticeNodes {
  /** Coordenadas do centro de cada célula de pista. */
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  col: Int32Array;
  row: Int32Array;
  /** Índice do nó na célula (coluna, linha) ou 0 se não for pista (índices começam em 1). */
  at: (col: number, row: number) => number;
}

function fromBase64(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(
    (globalThis as unknown as { Buffer: { from(s: string, e: string): Uint8Array } }).Buffer.from(
      b64,
      'base64',
    ),
  );
}

/** Decodifica a grade de pistas em nós (centros das células marcadas). */
export function latticeNodes(l: RoadLattice): LatticeNodes {
  const bits = fromBase64(l.mask);
  const raw = fromBase64(l.heights);
  const hs = l.h16
    ? new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength >> 1)
    : new Int8Array(raw.buffer);
  const hScale = l.h16 ? 10 : 2;
  const index = new Int32Array(l.cols * l.rows);
  const xs: number[] = [],
    ys: number[] = [],
    zs: number[] = [],
    cs: number[] = [],
    rs: number[] = [];
  let n = 0;
  for (let k = 0; k < l.cols * l.rows; k++) {
    if (!(bits[k >> 3]! & (1 << (k & 7)))) continue;
    const c = k % l.cols,
      r = Math.floor(k / l.cols);
    xs.push(l.minX + (c + 0.5) * l.cell);
    zs.push(l.minZ + (r + 0.5) * l.cell);
    ys.push((hs[n] ?? 0) / hScale);
    cs.push(c);
    rs.push(r);
    n++;
    index[k] = n;
  }
  return {
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    z: Float32Array.from(zs),
    col: Int32Array.from(cs),
    row: Int32Array.from(rs),
    at: (c, r) => (c < 0 || r < 0 || c >= l.cols || r >= l.rows ? 0 : index[r * l.cols + c]!),
  };
}
