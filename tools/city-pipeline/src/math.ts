/** Matriz 4x4 em ordem coluna-maior (mesma convenção do three.js). */
export type Mat4 = Float64Array;

export function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  }
  return o;
}

/** Transform VRML: T * R * S (sem center/scaleOrientation, ausentes nos arquivos do Driver). */
export function vrmlTransform(translation: number[], rotation: number[], scale: number[]): Mat4 {
  const [ax = 0, ay = 1, az = 0, angle = 0] = rotation;
  const len = Math.hypot(ax, ay, az) || 1;
  const x = ax / len,
    y = ay / len,
    z = az / len;
  const c = Math.cos(angle),
    s = Math.sin(angle),
    t = 1 - c;
  const [sx = 1, sy = 1, sz = 1] = scale;
  const m = new Float64Array(16);
  m[0] = (t * x * x + c) * sx;
  m[1] = (t * x * y + s * z) * sx;
  m[2] = (t * x * z - s * y) * sx;
  m[4] = (t * x * y - s * z) * sy;
  m[5] = (t * y * y + c) * sy;
  m[6] = (t * y * z + s * x) * sy;
  m[8] = (t * x * z + s * y) * sz;
  m[9] = (t * y * z - s * x) * sz;
  m[10] = (t * z * z + c) * sz;
  m[12] = translation[0] ?? 0;
  m[13] = translation[1] ?? 0;
  m[14] = translation[2] ?? 0;
  m[15] = 1;
  return m;
}

export function transformPoint(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

/** Ângulo de rotação em Y de uma matriz (assumindo rotação só em Y). Mesma convenção de rotateY. */
export function rotationY(m: Mat4): number {
  return Math.atan2(m[8]!, m[0]!);
}

/** Gira (x, z) em torno de Y pelo ângulo `a` (convenção VRML/three.js). */
export function rotateY(x: number, z: number, a: number): [number, number] {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c * x + s * z, -s * x + c * z];
}

/** Hash FNV-1a de 32 bits, usado para IDs e sementes determinísticas. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const round2 = (v: number): number => Math.round(v * 100) / 100;
