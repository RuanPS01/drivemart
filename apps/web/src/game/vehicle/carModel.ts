import { LAYER } from '../art/TextureLibrary';
import { faceShade, MeshBuilder, type MeshData, type Vec3 } from '../world/meshBuilder';

/** Dimensões do carro (m). Frente em +Z, chão em y = 0. */
export const CAR = {
  length: 4.6,
  width: 1.84,
  wheelRadius: 0.34,
  wheelWidth: 0.24,
  /** Posição das rodas: x lateral, z frente/trás, y do eixo em relação ao chão. */
  wheelX: 0.8,
  wheelFrontZ: 1.42,
  wheelRearZ: -1.38,
};

const W = CAR.width / 2;
const GLASS: Vec3 = [1, 1, 1];

function quadFace(
  b: MeshBuilder,
  pts: Vec3[],
  layer: number,
  tint: Vec3,
  uv: [number, number, number, number] = [0, 0, 1, 1],
): void {
  const [a, c, d, e] = pts as [Vec3, Vec3, Vec3, Vec3];
  const ux = c[0] - a[0],
    uy = c[1] - a[1],
    uz = c[2] - a[2];
  const vx = d[0] - a[0],
    vy = d[1] - a[1],
    vz = d[2] - a[2];
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  b.quad(a, c, d, e, uv, layer, tint, faceShade(nx / l, ny / l, nz / l));
}

/** Carroceria estilo anos 70 (sedã com capô longo), com a cor do carro em `paint`. */
export function buildCarBody(paint: Vec3): MeshData {
  const b = new MeshBuilder();
  const zf = CAR.length / 2,
    zr = -CAR.length / 2;
  const y0 = 0.36,
    y1 = 0.9;
  // Laterais da parte baixa (perfil com capô levemente inclinado).
  const side = (x: number, flip: boolean) => {
    const pts: Vec3[] = [
      [x, y0, zr],
      [x, y0, zf],
      [x, y1 - 0.06, zf],
      [x, y1, zr],
    ];
    quadFace(b, flip ? [pts[1]!, pts[0]!, pts[3]!, pts[2]!] : pts, LAYER.carPaint, paint);
  };
  side(W, true);
  side(-W, false);
  // Frente, traseira, capô e porta-malas.
  quadFace(
    b,
    [
      [-W, y0, zf],
      [W, y0, zf],
      [W, y1 - 0.06, zf],
      [-W, y1 - 0.06, zf],
    ],
    LAYER.carFront,
    GLASS,
  );
  quadFace(
    b,
    [
      [W, y0, zr],
      [-W, y0, zr],
      [-W, y1, zr],
      [W, y1, zr],
    ],
    LAYER.carRear,
    GLASS,
  );
  quadFace(
    b,
    [
      [W, y1 - 0.06, zf],
      [W, y1, 0.75],
      [-W, y1, 0.75],
      [-W, y1 - 0.06, zf],
    ],
    LAYER.carPaint,
    paint,
  );
  quadFace(
    b,
    [
      [W, y1, -1.45],
      [W, y1, zr],
      [-W, y1, zr],
      [-W, y1, -1.45],
    ],
    LAYER.carPaint,
    paint,
  );
  // Cabine.
  const cy0 = y1,
    cy1 = 1.33;
  const cw0 = W - 0.04,
    cw1 = W - 0.2;
  const zA = 0.75, // base do para-brisa
    zB = 0.15, // topo do para-brisa
    zC = -1.05, // topo do vidro traseiro
    zD = -1.45; // base do vidro traseiro
  quadFace(
    b,
    [
      [-cw0, cy0, zA],
      [cw0, cy0, zA],
      [cw1, cy1, zB],
      [-cw1, cy1, zB],
    ],
    LAYER.carGlass,
    GLASS,
  );
  quadFace(
    b,
    [
      [cw0, cy0, zD],
      [-cw0, cy0, zD],
      [-cw1, cy1, zC],
      [cw1, cy1, zC],
    ],
    LAYER.carGlass,
    GLASS,
  );
  quadFace(
    b,
    [
      [-cw1, cy1, zB],
      [cw1, cy1, zB],
      [cw1, cy1, zC],
      [-cw1, cy1, zC],
    ],
    LAYER.carPaint,
    paint,
  );
  quadFace(
    b,
    [
      [cw0, cy0, zA],
      [cw0, cy0, zD],
      [cw1, cy1, zC],
      [cw1, cy1, zB],
    ],
    LAYER.carGlass,
    GLASS,
  );
  quadFace(
    b,
    [
      [-cw0, cy0, zD],
      [-cw0, cy0, zA],
      [-cw1, cy1, zB],
      [-cw1, cy1, zC],
    ],
    LAYER.carGlass,
    GLASS,
  );
  // Para-choques cromados.
  b.box(0, 0.42, zf + 0.06, W, 0.07, 0.06, 0, LAYER.metal, GLASS);
  b.box(0, 0.42, zr - 0.06, W, 0.07, 0.06, 0, LAYER.metal, GLASS);
  return b.build();
}

/** Roda: cilindro ao longo do eixo Y (girar 90 graus em Z para ficar no eixo X). */
export function buildWheel(): MeshData {
  const b = new MeshBuilder();
  const r = CAR.wheelRadius,
    w = CAR.wheelWidth;
  b.cylinder(0, -w / 2, 0, r, r, w, 10, LAYER.tread, GLASS, LAYER.wheel);
  // Tampa inferior (a outra face da roda).
  const seg = 10;
  const center = b.vertex(0, -w / 2, 0, 0.5, 0.5, LAYER.wheel, GLASS, 0.8);
  const ring: number[] = [];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    ring.push(
      b.vertex(
        Math.cos(a) * r,
        -w / 2,
        Math.sin(a) * r,
        0.5 + Math.cos(a) * 0.5,
        0.5 + Math.sin(a) * 0.5,
        LAYER.wheel,
        GLASS,
        0.8,
      ),
    );
  }
  for (let k = 0; k < seg; k++) b.triangle(center, ring[k]!, ring[(k + 1) % seg]!);
  return b.build();
}
