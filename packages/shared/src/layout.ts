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
  roads: {
    /** x, y, z por nó. */
    nodes: number[];
    /** Pares de índices. */
    edges: number[];
  };
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
