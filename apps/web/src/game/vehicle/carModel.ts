import type { CarSlice, CarSpec } from '@drivemart/shared';
import { LAYER } from '../art/TextureLibrary';
import { faceShade, MeshBuilder, type MeshData, type Vec3 } from '../world/meshBuilder';

/**
 * Monta a malha de um carro a partir do perfil em fatias do catálogo da cidade (`cars.json`):
 * laterais, vidros, teto, frente e traseira pintadas por código, caixas de roda e pinturas especiais.
 * Frente em +Z, chão em y = 0.
 */

const WHITE: Vec3 = [1, 1, 1];
/** Afastamento das faixas pintadas por cima da lateral (evita brigar com ela no depth buffer). */
const OVERLAY = 0.012;

/** Carro usado se a cidade não tiver catálogo (sedã simples). */
export const FALLBACK_CAR: CarSpec = {
  id: 'padrao',
  name: 'Sedã',
  kind: 'sedan',
  length: 4.6,
  width: 1.84,
  height: 1.33,
  slices: [
    { z: -2.3, bottom: 0.32, belt: 0.88, roof: 0.88, halfWidth: 0.9, roofHalfWidth: 0.9 },
    { z: -1.45, bottom: 0.3, belt: 0.9, roof: 0.9, halfWidth: 0.92, roofHalfWidth: 0.92 },
    { z: -1.05, bottom: 0.3, belt: 0.9, roof: 1.33, halfWidth: 0.92, roofHalfWidth: 0.74 },
    { z: 0.15, bottom: 0.3, belt: 0.9, roof: 1.33, halfWidth: 0.92, roofHalfWidth: 0.74 },
    { z: 0.75, bottom: 0.3, belt: 0.88, roof: 0.88, halfWidth: 0.92, roofHalfWidth: 0.92 },
    { z: 2.3, bottom: 0.32, belt: 0.82, roof: 0.82, halfWidth: 0.9, roofHalfWidth: 0.9 },
  ],
  wheels: { radius: 0.34, axles: [1.42, -1.38], track: 0.8 },
  colors: [[188, 34, 28]],
  livery: 'plain',
  face: 'seventies',
  maxKmh: 190,
};

/** Converte uma cor do catálogo (0..255) na tinta dos vértices (compensa a base clara da textura). */
export function paintTint([r, g, b]: [number, number, number]): Vec3 {
  const k = 1.15 / 255;
  return [r * k, g * k, b * k];
}

export function wheelWidth(spec: CarSpec): number {
  return spec.wheels.radius >= 0.45 ? 0.34 : 0.24;
}

/** Eixos da frente e de trás (os das pontas). */
export function extremeAxles(spec: CarSpec): [number, number] {
  const a = spec.wheels.axles;
  return [Math.max(...a), Math.min(...a)];
}

/** Meia largura máxima da carroceria. */
export function maxHalfWidth(spec: CarSpec): number {
  return Math.max(...spec.slices.map((s) => s.halfWidth));
}

interface Profile {
  slices: CarSlice[];
  zMin: number;
  zMax: number;
  /** Altura típica da base das janelas. */
  beltLine: number;
  /** Trecho com cabine (vidros) e a base do para-brisa e do vidro traseiro. */
  cabin: { z0: number; z1: number; rearBase: number; frontBase: number } | null;
}

/**
 * Ordena as fatias, acha a cabine e alisa a linha das janelas.
 * Cabine: onde o teto passa de 60% entre a ponta mais baixa e o ponto mais alto (ônibus e vans: tudo);
 * em caminhões, só na metade da frente.
 */
export function carProfile(spec: CarSpec): Profile {
  const slices = [...spec.slices].sort((a, b) => a.z - b.z).map((s) => ({ ...s }));
  const first = slices[0]!,
    last = slices[slices.length - 1]!;
  const maxRoof = Math.max(...slices.map((s) => s.roof));
  const low = Math.min(first.roof, last.roof);
  const cut = low + (maxRoof - low) * 0.6;
  const tall = spec.kind === 'bus' || spec.kind === 'van';
  const frontOnly = spec.kind === 'truck' || spec.kind === 'fire';
  const zFront = last.z - (last.z - first.z) * 0.5;
  const isCab = (s: CarSlice) =>
    s.roof - s.belt > 0.12 && (tall || s.roof >= cut) && (!frontOnly || s.z >= zFront);
  const cab = slices.filter(isCab);
  const belts = cab.map((s) => s.belt).sort((a, b) => a - b);
  const beltLine = belts.length
    ? belts[Math.floor(belts.length / 2)]!
    : Math.max(...slices.map((s) => s.roof)) * 0.7;
  for (const s of slices) {
    if (cab.includes(s)) s.belt = Math.min(beltLine, s.roof);
    else {
      // Sem cabine: lateral até o teto e teto da largura da carroceria (sem frestas).
      s.belt = s.roof;
      s.roofHalfWidth = s.halfWidth;
    }
  }
  let cabin: Profile['cabin'] = null;
  if (cab.length) {
    const z0 = Math.min(...cab.map((s) => s.z)),
      z1 = Math.max(...cab.map((s) => s.z));
    const behind = slices.filter((s) => s.z < z0).pop();
    const ahead = slices.find((s) => s.z > z1);
    cabin = { z0, z1, rearBase: behind?.z ?? z0, frontBase: ahead?.z ?? z1 };
  }
  return { slices, zMin: slices[0]!.z, zMax: slices[slices.length - 1]!.z, beltLine, cabin };
}

/** Fatia interpolada numa posição z. */
function sliceAt(slices: CarSlice[], z: number): CarSlice {
  if (z <= slices[0]!.z) return { ...slices[0]!, z };
  for (let i = 1; i < slices.length; i++) {
    const b = slices[i]!;
    if (z <= b.z) {
      const a = slices[i - 1]!;
      const t = (z - a.z) / (b.z - a.z || 1);
      const l = (p: number, q: number) => p + (q - p) * t;
      return {
        z,
        bottom: l(a.bottom, b.bottom),
        belt: l(a.belt, b.belt),
        roof: l(a.roof, b.roof),
        halfWidth: l(a.halfWidth, b.halfWidth),
        roofHalfWidth: l(a.roofHalfWidth, b.roofHalfWidth),
      };
    }
  }
  return { ...slices[slices.length - 1]!, z };
}

interface Ring extends CarSlice {
  /** Base da carroceria sem o recorte das rodas. */
  base: number;
}

/** Face plana (3 ou 4 pontos, anti-horário vista de fora), com sombreamento pela normal. */
function face(b: MeshBuilder, p: Vec3[], uv: [number, number][], layer: number, tint: Vec3): void {
  let nx = 0,
    ny = 0,
    nz = 0;
  for (let k = 1; k + 1 < p.length; k++) {
    const a = p[0]!,
      c = p[k]!,
      d = p[k + 1]!;
    const ux = c[0] - a[0],
      uy = c[1] - a[1],
      uz = c[2] - a[2];
    const vx = d[0] - a[0],
      vy = d[1] - a[1],
      vz = d[2] - a[2];
    nx += uy * vz - uz * vy;
    ny += uz * vx - ux * vz;
    nz += ux * vy - uy * vx;
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-7) return;
  const shade = faceShade(nx / len, ny / len, nz / len);
  const idx = p.map((q, k) => b.vertex(q[0], q[1], q[2], uv[k]![0], uv[k]![1], layer, tint, shade));
  b.triangle(idx[0]!, idx[1]!, idx[2]!);
  if (idx.length === 4) b.triangle(idx[0]!, idx[2]!, idx[3]!);
}

/** Caixa com a textura inteira em cada face (sem a face de baixo). */
function uvBox(
  b: MeshBuilder,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  layer: number,
  tint: Vec3,
): void {
  const x0 = cx - hx,
    x1 = cx + hx,
    y0 = cy - hy,
    y1 = cy + hy,
    z0 = cz - hz,
    z1 = cz + hz;
  const uv: [number, number][] = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ];
  face(
    b,
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ],
    uv,
    layer,
    tint,
  );
  face(
    b,
    [
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0],
    ],
    uv,
    layer,
    tint,
  );
  face(
    b,
    [
      [x1, y0, z1],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
    ],
    uv,
    layer,
    tint,
  );
  face(
    b,
    [
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
    ],
    uv,
    layer,
    tint,
  );
  face(
    b,
    [
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0],
    ],
    uv,
    layer,
    tint,
  );
}

const FRONT_LAYER = {
  classic: LAYER.carFrontClassic,
  seventies: LAYER.carFront70,
  bus: LAYER.carFrontBus,
  truck: LAYER.carFrontTruck,
} as const;

/** Carroceria completa de um tipo de carro, pintada com a cor `color` (0..255). */
export function buildCarBody(spec: CarSpec, color: [number, number, number]): MeshData {
  const b = new MeshBuilder();
  const paint = paintTint(color);
  const prof = carProfile(spec);
  const { slices, zMin, zMax, cabin, beltLine } = prof;
  const r = spec.wheels.radius;
  const ww = wheelWidth(spec);
  const tall = spec.kind === 'bus' || spec.kind === 'van';
  const rust = spec.livery === 'rust';
  const [axFront, axRear] = extremeAxles(spec);

  // Caixas de roda: trapézio acima de cada eixo.
  const arches = spec.wheels.axles.map((a) => {
    const s = sliceAt(slices, a);
    return {
      a,
      top: Math.min(2 * r + 0.04, s.bottom + (s.belt - s.bottom) * 0.8),
      inner: r * 0.95,
      outer: r * 1.3,
    };
  });
  const innerX = Math.max(0.2, spec.wheels.track - ww / 2 - 0.03);
  const archBottom = (z: number, base: number) => {
    let y = base;
    for (const h of arches) {
      const d = Math.abs(z - h.a);
      if (d <= h.inner) y = Math.max(y, h.top);
      else if (d < h.outer) y = Math.max(y, h.top + (base - h.top) * ((d - h.inner) / (h.outer - h.inner)));
    }
    return y;
  };
  const ring = (z: number): Ring => {
    const s = sliceAt(slices, z);
    return { ...s, base: s.bottom, bottom: archBottom(z, s.bottom) };
  };

  // Portas: entre as caixas de roda, dentro do trecho da cabine.
  let doors: [number, number] | null = null;
  if (cabin && spec.kind !== 'bus') {
    const d0 = Math.max(cabin.rearBase, axRear + r * 1.3),
      d1 = Math.min(cabin.frontBase, axFront - r * 1.3);
    if (d1 - d0 > 0.5) doors = [d0, d1];
  }
  // Caçamba da picape: atrás da cabine até a tampa traseira.
  const bed: [number, number] | null =
    spec.kind === 'pickup' && cabin && cabin.rearBase - zMin > 0.8 ? [zMin + 0.06, cabin.rearBase] : null;

  const zs = new Set<number>(slices.map((s) => s.z));
  for (const h of arches) for (const d of [-h.outer, -h.inner, h.inner, h.outer]) zs.add(h.a + d);
  if (doors) zs.add(doors[0]).add(doors[1]);
  if (bed) zs.add(bed[0]).add(bed[1]);
  const Z = [...zs]
    .filter((z) => z >= zMin - 1e-6 && z <= zMax + 1e-6)
    .sort((p, q) => p - q)
    .filter((z, i, list) => i === 0 || z - list[i - 1]! > 1e-4);
  const rings = Z.map(ring);
  const inDoors = (z: number) => doors !== null && z >= doors[0] - 1e-6 && z <= doors[1] + 1e-6;
  const inBed = (z: number) => bed !== null && z >= bed[0] - 1e-6 && z <= bed[1] + 1e-6;

  for (let i = 0; i + 1 < rings.length; i++) {
    const p = rings[i]!,
      q = rings[i + 1]!;
    const zm = (p.z + q.z) / 2;
    const door = inDoors(zm);

    // Lateral de baixo (da base até a cintura), com a textura medida pela altura real.
    const lower = rust ? LAYER.carRust : door ? LAYER.carDoor : LAYER.carSide;
    const [uRef, uLen] = door ? [doors![1], doors![1] - doors![0]] : [zMax, 1.6];
    const v = (s: Ring, y: number) => (s.belt - y) / Math.max(0.05, s.belt - s.base);
    const uR = (z: number) => (uRef - z) / uLen;
    const uL = (z: number) => (z - (door ? doors![0] : zMin)) / uLen;
    face(
      b,
      [
        [q.halfWidth, q.bottom, q.z],
        [p.halfWidth, p.bottom, p.z],
        [p.halfWidth, p.belt, p.z],
        [q.halfWidth, q.belt, q.z],
      ],
      [
        [uR(q.z), v(q, q.bottom)],
        [uR(p.z), v(p, p.bottom)],
        [uR(p.z), 0],
        [uR(q.z), 0],
      ],
      lower,
      paint,
    );
    face(
      b,
      [
        [-p.halfWidth, p.bottom, p.z],
        [-q.halfWidth, q.bottom, q.z],
        [-q.halfWidth, q.belt, q.z],
        [-p.halfWidth, p.belt, p.z],
      ],
      [
        [uL(p.z), v(p, p.bottom)],
        [uL(q.z), v(q, q.bottom)],
        [uL(q.z), 0],
        [uL(p.z), 0],
      ],
      lower,
      paint,
    );

    // Vidros laterais (da cintura até o teto).
    if (p.roof - p.belt + (q.roof - q.belt) > 0.02) {
      const glass = tall ? LAYER.carWindows : LAYER.carGlass;
      const tile = tall ? 1.25 : 1.2;
      face(
        b,
        [
          [q.halfWidth, q.belt, q.z],
          [p.halfWidth, p.belt, p.z],
          [p.roofHalfWidth, p.roof, p.z],
          [q.roofHalfWidth, q.roof, q.z],
        ],
        [
          [(zMax - q.z) / tile, 1],
          [(zMax - p.z) / tile, 1],
          [(zMax - p.z) / tile, 0],
          [(zMax - q.z) / tile, 0],
        ],
        glass,
        paint,
      );
      face(
        b,
        [
          [-p.halfWidth, p.belt, p.z],
          [-q.halfWidth, q.belt, q.z],
          [-q.roofHalfWidth, q.roof, q.z],
          [-p.roofHalfWidth, p.roof, p.z],
        ],
        [
          [(p.z - zMin) / tile, 1],
          [(q.z - zMin) / tile, 1],
          [(q.z - zMin) / tile, 0],
          [(p.z - zMin) / tile, 0],
        ],
        glass,
        paint,
      );
    }

    // Teto, capô e porta-malas; para-brisa e vidro traseiro onde a cabine inclina.
    if (inBed(zm)) {
      addBedSection(b, p, q, paint);
    } else {
      const slope = Math.abs(q.roof - p.roof) / Math.max(1e-3, q.z - p.z);
      const glass = slope > 0.3 && Math.max(p.roof, q.roof) > beltLine + 0.08;
      face(
        b,
        [
          [p.roofHalfWidth, p.roof, p.z],
          [-p.roofHalfWidth, p.roof, p.z],
          [-q.roofHalfWidth, q.roof, q.z],
          [q.roofHalfWidth, q.roof, q.z],
        ],
        glass
          ? [
              [1, 1],
              [0, 1],
              [0, 0],
              [1, 0],
            ]
          : [
              [1, p.z / 2],
              [0, p.z / 2],
              [0, q.z / 2],
              [1, q.z / 2],
            ],
        glass ? LAYER.carGlass : LAYER.carTop,
        paint,
      );
    }

    // Fundo escuro e caixas de roda (paredes internas e teto do recorte).
    face(
      b,
      [
        [innerX, p.base, p.z],
        [innerX, q.base, q.z],
        [-innerX, q.base, q.z],
        [-innerX, p.base, p.z],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ],
      LAYER.tread,
      WHITE,
    );
    if (p.bottom - p.base > 1e-3 || q.bottom - q.base > 1e-3) {
      for (const sx of [1, -1]) {
        const wall: Vec3[] = [
          [sx * innerX, p.base, p.z],
          [sx * innerX, q.base, q.z],
          [sx * innerX, q.bottom, q.z],
          [sx * innerX, p.bottom, p.z],
        ];
        const ceil: Vec3[] = [
          [sx * innerX, p.bottom, p.z],
          [sx * innerX, q.bottom, q.z],
          [sx * q.halfWidth, q.bottom, q.z],
          [sx * p.halfWidth, p.bottom, p.z],
        ];
        const uv: [number, number][] = [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ];
        // A ordem muda de um lado para o outro para a parede ficar virada para fora e o teto para baixo.
        face(b, sx > 0 ? [...wall].reverse() : wall, uv, LAYER.tread, WHITE);
        face(b, sx > 0 ? [...ceil].reverse() : ceil, uv, LAYER.tread, WHITE);
      }
    }
  }

  // Frente e traseira.
  const front = rings[rings.length - 1]!,
    rear = rings[0]!;
  const capUv: [number, number][] = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ];
  face(
    b,
    [
      [-front.halfWidth, front.base, front.z],
      [front.halfWidth, front.base, front.z],
      [front.halfWidth, front.belt, front.z],
      [-front.halfWidth, front.belt, front.z],
    ],
    capUv,
    FRONT_LAYER[spec.face],
    paint,
  );
  face(
    b,
    [
      [rear.halfWidth, rear.base, rear.z],
      [-rear.halfWidth, rear.base, rear.z],
      [-rear.halfWidth, rear.belt, rear.z],
      [rear.halfWidth, rear.belt, rear.z],
    ],
    capUv,
    spec.face === 'classic' ? LAYER.carRearClassic : LAYER.carRear70,
    paint,
  );
  if (front.roof - front.belt > 0.02)
    face(
      b,
      [
        [-front.halfWidth, front.belt, front.z],
        [front.halfWidth, front.belt, front.z],
        [front.roofHalfWidth, front.roof, front.z],
        [-front.roofHalfWidth, front.roof, front.z],
      ],
      capUv,
      LAYER.carGlass,
      paint,
    );
  if (rear.roof - rear.belt > 0.02)
    face(
      b,
      [
        [rear.halfWidth, rear.belt, rear.z],
        [-rear.halfWidth, rear.belt, rear.z],
        [-rear.roofHalfWidth, rear.roof, rear.z],
        [rear.roofHalfWidth, rear.roof, rear.z],
      ],
      capUv,
      LAYER.carGlass,
      paint,
    );

  // Para-choques: cromados nos carros, pretos em ônibus e caminhões.
  const bumper = spec.face === 'bus' || spec.face === 'truck' ? LAYER.tread : LAYER.metal;
  for (const [s, dz] of [
    [front, 0.03],
    [rear, -0.03],
  ] as const) {
    const y = s.belt - (s.belt - s.base) * 0.8;
    b.box(0, y, s.z + dz, s.halfWidth * 0.98, 0.06, 0.05, 0, bumper, WHITE);
  }

  if (bed) addBedEnds(b, ring(bed[0]), ring(bed[1]), paint);
  addLivery(b, spec, prof, rings, ring, paint);
  return b.build();
}

const BED_WALL = 0.06;
const bedFloor = (s: Ring) => s.base + (s.roof - s.base) * 0.45;
const darker = (c: Vec3): Vec3 => [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55];
const QUAD_UV: [number, number][] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
];

/** Paredes internas da caçamba na tampa traseira (virada para a frente) e atrás da cabine. */
function addBedEnds(b: MeshBuilder, back: Ring, front: Ring, paint: Vec3): void {
  const hb = back.halfWidth - BED_WALL,
    hf = front.halfWidth - BED_WALL;
  const dark = darker(paint);
  face(
    b,
    [
      [-hb, bedFloor(back), back.z],
      [hb, bedFloor(back), back.z],
      [hb, back.roof, back.z],
      [-hb, back.roof, back.z],
    ],
    QUAD_UV,
    LAYER.carSide,
    dark,
  );
  face(
    b,
    [
      [hf, bedFloor(front), front.z],
      [-hf, bedFloor(front), front.z],
      [-hf, front.roof, front.z],
      [hf, front.roof, front.z],
    ],
    QUAD_UV,
    LAYER.carSide,
    dark,
  );
}

/** Trecho da caçamba: piso rebaixado, paredes internas e bordas. */
function addBedSection(b: MeshBuilder, p: Ring, q: Ring, paint: Vec3): void {
  const t = BED_WALL;
  const floor = bedFloor;
  const dark = darker(paint);
  const uv = QUAD_UV;
  for (const sx of [1, -1]) {
    const pi = p.halfWidth - t,
      qi = q.halfWidth - t;
    const rim: Vec3[] = [
      [sx * p.halfWidth, p.roof, p.z],
      [sx * pi, p.roof, p.z],
      [sx * qi, q.roof, q.z],
      [sx * q.halfWidth, q.roof, q.z],
    ];
    const wall: Vec3[] = [
      [sx * pi, floor(p), p.z],
      [sx * qi, floor(q), q.z],
      [sx * qi, q.roof, q.z],
      [sx * pi, p.roof, p.z],
    ];
    face(b, sx > 0 ? rim : [...rim].reverse(), uv, LAYER.carTop, paint);
    face(b, sx > 0 ? wall : [...wall].reverse(), uv, LAYER.carSide, dark);
  }
  face(
    b,
    [
      [p.halfWidth - t, floor(p), p.z],
      [-(p.halfWidth - t), floor(p), p.z],
      [-(q.halfWidth - t), floor(q), q.z],
      [q.halfWidth - t, floor(q), q.z],
    ],
    uv,
    LAYER.carTop,
    dark,
  );
}

/** Pinturas especiais: portas de viatura, xadrez do táxi, faixas, madeira, giroflex, placa e escada. */
function addLivery(
  b: MeshBuilder,
  spec: CarSpec,
  prof: Profile,
  rings: Ring[],
  ring: (z: number) => Ring,
  paint: Vec3,
): void {
  const { zMin, zMax, cabin } = prof;
  const r = spec.wheels.radius;
  const [axFront, axRear] = extremeAxles(spec);

  /** Faixa por cima das laterais, entre as alturas relativas `ta` e `tb` (0 = cintura, 1 = base). */
  const band = (za: number, zb: number, ta: number, tb: number, layer: number, tile: number | 'fit') => {
    if (zb - za < 0.1) return;
    const zs = [za, ...rings.map((s) => s.z).filter((z) => z > za + 1e-4 && z < zb - 1e-4), zb];
    const pts = zs.map((z) => {
      const s = ring(z);
      const h = s.belt - s.base;
      const top = s.belt - ta * h;
      const bot = Math.min(top, Math.max(s.belt - tb * h, s.bottom + 0.005));
      return { z, x: s.halfWidth + OVERLAY, top, bot, h: Math.max(0.01, (tb - ta) * h) };
    });
    const uR = (z: number) => (tile === 'fit' ? (zb - z) / (zb - za) : (zb - z) / tile);
    const uL = (z: number) => (tile === 'fit' ? (z - za) / (zb - za) : (z - za) / tile);
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i]!,
        q = pts[i + 1]!;
      const vb = (s: typeof p) => (s.top - s.bot) / s.h;
      face(
        b,
        [
          [q.x, q.bot, q.z],
          [p.x, p.bot, p.z],
          [p.x, p.top, p.z],
          [q.x, q.top, q.z],
        ],
        [
          [uR(q.z), vb(q)],
          [uR(p.z), vb(p)],
          [uR(p.z), 0],
          [uR(q.z), 0],
        ],
        layer,
        paint,
      );
      face(
        b,
        [
          [-p.x, p.bot, p.z],
          [-q.x, q.bot, q.z],
          [-q.x, q.top, q.z],
          [-p.x, p.top, p.z],
        ],
        [
          [uL(p.z), vb(p)],
          [uL(q.z), vb(q)],
          [uL(q.z), 0],
          [uL(p.z), 0],
        ],
        layer,
        paint,
      );
    }
  };

  // Meio do teto (onde ficam giroflex e placa de táxi).
  const top = Math.max(...prof.slices.map((s) => s.roof));
  const plateau = prof.slices.filter((s) => s.roof >= top - 0.04);
  const zc = plateau.length ? (plateau[0]!.z + plateau[plateau.length - 1]!.z) / 2 : 0;
  const roofC = ring(zc);
  const doorA = Math.max(cabin?.rearBase ?? zMin, axRear + r * 1.3),
    doorB = Math.min(cabin?.frontBase ?? zMax, axFront - r * 1.3);

  switch (spec.livery) {
    case 'police-sf':
    case 'police-rio': {
      band(
        doorA,
        doorB,
        0.04,
        0.96,
        spec.livery === 'police-sf' ? LAYER.carPoliceSF : LAYER.carPoliciaRio,
        'fit',
      );
      const hx = Math.min(0.55, roofC.roofHalfWidth * 0.8);
      uvBox(b, 0, roofC.roof + 0.07, zc, hx, 0.07, 0.12, LAYER.carLightbar, WHITE);
      break;
    }
    case 'taxi-sf': {
      band(zMin + 0.3, zMax - 0.3, 0.28, 0.4, LAYER.carChecker, 0.5);
      uvBox(b, 0, roofC.roof + 0.11, zc, 0.3, 0.11, 0.07, LAYER.carTaxiSign, WHITE);
      break;
    }
    case 'fire': {
      band(zMin + 0.1, zMax - 0.1, 0.3, 0.45, LAYER.carStripe, 1);
      // Escada sobre a carroceria, atrás da cabine.
      const z0 = zMin + 0.4,
        z1 = (cabin?.z0 ?? zMax - 2) - 0.1;
      if (z1 - z0 > 1) {
        const ys = prof.slices.filter((s) => s.z >= z0 && s.z <= z1).map((s) => s.roof);
        const y = (ys.length ? Math.max(...ys) : top) + 0.14;
        for (const x of [0.36, -0.36])
          b.box(x, y, (z0 + z1) / 2, 0.035, 0.035, (z1 - z0) / 2, 0, LAYER.metal, WHITE);
        for (let z = z0 + 0.2; z < z1; z += 0.4) b.box(0, y, z, 0.36, 0.02, 0.02, 0, LAYER.metal, WHITE);
      }
      break;
    }
    case 'bus':
      band(zMin + 0.05, zMax - 0.05, 0.02, 0.2, LAYER.carStripe, 1.5);
      break;
    case 'woody':
      band(zMin + 0.25, axFront - r * 1.3, 0.12, 0.85, LAYER.carWood, 'fit');
      break;
    default:
      break;
  }
}

/** Roda: cilindro ao longo do eixo Y (girar 90 graus em Z para ficar no eixo X). */
export function buildWheel(radius: number, width: number): MeshData {
  const b = new MeshBuilder();
  const seg = 10;
  b.cylinder(0, -width / 2, 0, radius, radius, width, seg, LAYER.tread, WHITE, LAYER.wheel);
  // Tampa inferior (a outra face da roda).
  const center = b.vertex(0, -width / 2, 0, 0.5, 0.5, LAYER.wheel, WHITE, 0.8);
  const ring: number[] = [];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    ring.push(
      b.vertex(
        Math.cos(a) * radius,
        -width / 2,
        Math.sin(a) * radius,
        0.5 + Math.cos(a) * 0.5,
        0.5 + Math.sin(a) * 0.5,
        LAYER.wheel,
        WHITE,
        0.8,
      ),
    );
  }
  for (let k = 0; k < seg; k++) b.triangle(center, ring[k]!, ring[(k + 1) % seg]!);
  return b.build();
}
