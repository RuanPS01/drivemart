import type { Model } from './scene';

/** Materiais de chão do traçado. A ordem define a prioridade quando duas peças se sobrepõem na mesma altura. */
export const GROUND_MATERIALS = ['road', 'sidewalk', 'plaza', 'sand', 'dirt', 'grass', 'water'] as const;
export type GroundMat = (typeof GROUND_MATERIALS)[number];

export const PROP_TYPES = [
  'streetlight',
  'trafficlight',
  'mastlight',
  'cone',
  'box',
  'barrel',
  'bin',
  'chair',
  'table',
  'umbrella',
  'barrier',
] as const;
export type PropType = (typeof PROP_TYPES)[number];

export const TREE_TYPES = ['palm', 'tree', 'bush'] as const;
export type TreeType = (typeof TREE_TYPES)[number];

export type ModelClass =
  | { kind: 'skip' }
  /** Peça de chão; `mat` nulo significa material decidido pela cor de cada triângulo. */
  | { kind: 'ground'; mat: GroundMat | null }
  | { kind: 'prop'; prop: PropType }
  | { kind: 'tree'; tree: TreeType }
  /** Fachadas de prédios (painéis verticais). */
  | { kind: 'building' }
  /** Muretas, grades e paredes baixas. */
  | { kind: 'wall' }
  /** Encostas inclinadas (relevo). */
  | { kind: 'terrain' };

const NAMED_SKIP =
  /^(LOW_|DETAIL_)|^(HEAD|NECK|TORSO|HIPS|PEDHEAD\d*|[UL]_ARM_.*|HAND_.*|THIGH_.*|CALF_.*|FOOT_.*|CAR|WHEEL|CLEANWHEEL|DAMWHEEL|FASTWHEEL|HUBCAP\d*|BASE\d|SORT\d+|DOOR\d*|FRAME|STRUT|GATE)$/;

const NAMED_PROPS: [RegExp, PropType][] = [
  [/^SLIGHT/, 'streetlight'],
  [/^TLIGHT/, 'trafficlight'],
  [/^(MLIGHT|NPLIGHT|DLIGHT)/, 'mastlight'],
  [/^(CONE|GREENCONE)/, 'cone'],
  [/^BOX/, 'box'],
  [/^BARREL/, 'barrel'],
  [/^BIN/, 'bin'],
  [/^CHAIR/, 'chair'],
  [/^TABLE/, 'table'],
  [/^UMBRELLA/, 'umbrella'],
];

const NAMED_GROUND: [RegExp, GroundMat][] = [
  [/^(ROAD|JUNC|CURVE)/, 'road'],
  [/^PATH/, 'sidewalk'],
  [/^GRASS/, 'grass'],
  [/^SAND/, 'sand'],
  [/^(GREY-TILE|TILE|BIGPATH|PAVE)/, 'plaza'],
];

/** Nome legível do modelo (sem o prefixo numérico do exportador). */
export function shortName(model: string): string {
  return model.replace(/^_\d{4}_/, '').replace(/\.wrl$/, '');
}

export function classifyModel(model: Model): ModelClass {
  const name = shortName(model.name);
  const [x0, y0, z0, x1, y1, z1] = model.bbox;
  const h = y1 - y0;
  const wMax = Math.max(x1 - x0, z1 - z0);
  const wMin = Math.min(x1 - x0, z1 - z0);

  if (model.billboard) {
    if (h < 2.2) return { kind: 'tree', tree: 'bush' };
    if (h > 12 || h / Math.max(wMax, 0.1) > 1.6) return { kind: 'tree', tree: 'palm' };
    return { kind: 'tree', tree: 'tree' };
  }
  if (name && NAMED_SKIP.test(name)) return { kind: 'skip' };
  if (name) {
    for (const [re, prop] of NAMED_PROPS) if (re.test(name)) return { kind: 'prop', prop };
    if (/^(BARRIER|FENCE|STRAIGHT)/.test(name)) return { kind: 'wall' };
    for (const [re, mat] of NAMED_GROUND) if (re.test(name)) return { kind: 'ground', mat };
  }
  // Peças sem nome (ou com nomes desconhecidos): decide pela geometria.
  if (h < 0.35) return { kind: 'ground', mat: null };
  if (h < 3) return wMin < 1.2 ? { kind: 'wall' } : { kind: 'skip' };
  if (wMax > 60 || h > 40) return { kind: 'terrain' };
  return { kind: 'building' };
}

/** Material de chão a partir da cor média (RGB 0..255) da textura original. Só o rótulo é guardado. */
export function groundMatFromColor(r: number, g: number, b: number, raised: boolean): GroundMat {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 510;
  const sat = max === 0 ? 0 : (max - min) / max;
  if (b > r + 20 && b >= g && sat > 0.12) return 'water';
  if (g > r + 6 && g > b + 6 && sat > 0.12) return 'grass';
  if (r > b + 28 && g > b + 14 && l > 0.42) return 'sand';
  if (r > b + 22 && r > g + 4 && l <= 0.42) return 'dirt';
  if (l < 0.36 && !raised) return 'road';
  return raised ? 'sidewalk' : 'plaza';
}

/** Ordem de prioridade (menor = mais importante). */
export function matPriority(m: GroundMat): number {
  return GROUND_MATERIALS.indexOf(m);
}
