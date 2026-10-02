/**
 * Especificação de um tipo de carro (arquivo `packages/city-data/<cidade>/cars.json`).
 * Só números e rótulos: o perfil da carroceria em fatias ao longo do comprimento, as rodas e as cores.
 * O jogo monta a malha e pinta as texturas por código a partir disso.
 * Coordenadas em metros, frente em +Z, chão em y = 0.
 */

/** Fatia transversal da carroceria. */
export interface CarSlice {
  z: number;
  /** Altura da parte de baixo da carroceria (vão livre). */
  bottom: number;
  /** Linha da cintura (base das janelas). Igual a `roof` onde não há cabine (capô, porta-malas, caçamba). */
  belt: number;
  roof: number;
  /** Meia largura da carroceria e da cabine. */
  halfWidth: number;
  roofHalfWidth: number;
}

export type CarKind =
  | 'compact'
  | 'sedan'
  | 'coupe'
  | 'wagon'
  | 'pickup'
  | 'van'
  | 'bus'
  | 'truck'
  | 'limo'
  | 'police'
  | 'taxi'
  | 'fire';

/** Pinturas especiais desenhadas por cima da cor do carro. */
export type CarLivery = 'plain' | 'police-rio' | 'police-sf' | 'taxi-sf' | 'fire' | 'bus' | 'rust' | 'woody';

/** Estilo de frente e traseira (texturas pintadas por código). */
export type CarFace = 'classic' | 'seventies' | 'bus' | 'truck';

export interface CarSpec {
  id: string;
  name: string;
  kind: CarKind;
  length: number;
  width: number;
  height: number;
  slices: CarSlice[];
  wheels: {
    radius: number;
    /** Posição dos eixos ao longo do comprimento (z). */
    axles: number[];
    /** Distância do centro até o meio da roda, de cada lado. */
    track: number;
  };
  /** Cores da carroceria (0..255); a primeira é a original. */
  colors: [number, number, number][];
  livery: CarLivery;
  face: CarFace;
  /** Velocidade máxima (km/h). */
  maxKmh: number;
}

export interface CarCatalog {
  cityId: string;
  source: string;
  cars: CarSpec[];
}
