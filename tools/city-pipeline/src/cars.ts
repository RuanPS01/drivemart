import type { CarFace, CarKind, CarLivery, CarSlice, CarSpec } from '@drivemart/shared';
import { round2 } from './math';
import type { Model } from './scene';
import type { TriangleColors } from './world';

/** Rótulos de cada carro (nome, tipo, pintura), definidos olhando as páginas de textura do nível. */
export interface CarMeta {
  name: string;
  kind: CarKind;
  livery: CarLivery;
  face: CarFace;
  maxKmh: number;
  /** Cores extras oferecidas além da original (0..255). */
  extraColors?: [number, number, number][];
  /** Cor fixa da pintura de serviço (bombeiros, ônibus, polícia), no lugar da amostrada. */
  color?: [number, number, number];
}

interface Sample {
  x: number;
  y: number;
  z: number;
}

const SLICES = 18;

// Laços em vez de Math.max(...lista): as listas de pontos passam de 100 mil itens.
function minOf<T>(list: readonly T[], f: (v: T) => number): number {
  let m = Infinity;
  for (const v of list) m = Math.min(m, f(v));
  return m;
}
function maxOf<T>(list: readonly T[], f: (v: T) => number): number {
  let m = -Infinity;
  for (const v of list) m = Math.max(m, f(v));
  return m;
}

/** Reforça um pouco a saturação e o brilho da cor amostrada. */
function boost([r, g, b]: [number, number, number]): [number, number, number] {
  const m = (r + g + b) / 3;
  return [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, (m + (v - m) * 1.35) * 1.1)))) as [
    number,
    number,
    number,
  ];
}

function luminance(r: number, g: number, b: number): number {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

function median(values: number[]): number {
  const a = [...values].sort((p, q) => p - q);
  return a[Math.floor(a.length / 2)]!;
}

/**
 * Tira picos isolados do perfil (escadas, sirenes, guinchos e falhas de medição) com mediana móvel:
 * janela de 5 fatias nas alturas, de 3 nas larguras. Degraus e rampas (para-brisa) continuam.
 */
export function smoothSlices(slices: CarSlice[]): void {
  // Janela simétrica que encolhe perto das pontas (assim a queda do capô na ponta não some).
  const pick = (f: (s: CarSlice) => number, w: number) =>
    slices.map((_, i) => {
      const k = Math.min(w, i, slices.length - 1 - i);
      return median(slices.slice(i - k, i + k + 1).map(f));
    });
  const roof = pick((s) => s.roof, 2);
  const belt = pick((s) => s.belt, 2);
  const hw = pick((s) => s.halfWidth, 1);
  const rhw = pick((s) => s.roofHalfWidth, 1);
  const floor = median(hw) * 0.85;
  slices.forEach((s, i) => {
    s.roof = roof[i]!;
    s.belt = Math.min(belt[i]!, s.roof);
    s.halfWidth = Math.max(hw[i]!, floor);
    s.roofHalfWidth = Math.min(rhw[i]!, s.halfWidth);
  });
}

/**
 * Mede um carro do Driver 2: orientação, perfil da carroceria em fatias, eixos e cor.
 * Só números saem daqui; a malha e a textura do jogo são feitas por código no cliente.
 */
export function measureCar(model: Model, colors: TriangleColors, id: string, meta: CarMeta): CarSpec {
  type Tri = {
    p: number[];
    r: number;
    g: number;
    b: number;
    cov: number;
    area: number;
    nx: number;
    nz: number;
  };
  const tris: Tri[] = [];
  model.parts.forEach((part, pi) => {
    const col = colors.of(model, pi);
    const P = part.positions;
    for (let t = 0; t < P.length / 9; t++) {
      const p = Array.from(P.subarray(t * 9, t * 9 + 9));
      const ax = p[3]! - p[0]!,
        ay = p[4]! - p[1]!,
        az = p[5]! - p[2]!;
      const bx = p[6]! - p[0]!,
        by = p[7]! - p[1]!,
        bz = p[8]! - p[2]!;
      const nx = ay * bz - az * by,
        ny = az * bx - ax * bz,
        nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-9) continue;
      tris.push({
        p,
        r: col[t * 4]!,
        g: col[t * 4 + 1]!,
        b: col[t * 4 + 2]!,
        cov: col[t * 4 + 3]!,
        area: len / 2,
        nx: nx / len,
        nz: nz / len,
      });
    }
  });

  const [x0, y0, z0, x1, y1, z1] = model.bbox;
  const halfH = (y1 - y0) / 2,
    midY = (y0 + y1) / 2;
  // Teto mais estreito que a base: decide se y cresce para cima.
  const widthNear = (top: boolean) => {
    let w = 0;
    for (const t of tris)
      for (let v = 0; v < 9; v += 3) {
        const y = t.p[v + 1]!;
        if (top ? y > midY + halfH * 0.7 : y < midY - halfH * 0.7) w = Math.max(w, Math.abs(t.p[v]!));
      }
    return w;
  };
  const flipY = widthNear(true) > widthNear(false);
  // Lanternas vermelhas ficam atrás: a ponta mais vermelha é a traseira.
  const redness = (sign: number) => {
    let sum = 0,
      w = 0;
    for (const t of tris) {
      const cz = (t.p[2]! + t.p[5]! + t.p[8]!) / 3;
      if (sign * cz < (z1 - z0) * 0.35 || sign * t.nz < 0.5 || t.cov < 0.3) continue;
      sum += (t.r - (t.g + t.b) / 2) * t.area;
      w += t.area;
    }
    return w ? sum / w : 0;
  };
  const flipZ = redness(1) > redness(-1);
  const sy = flipY ? -1 : 1,
    sz = flipZ ? -1 : 1;

  // Pontos densos sobre a superfície, já orientados (frente em +z, teto em +y).
  const samples: Sample[] = [];
  // Cor da carroceria: a mais frequente nas laterais de baixo (sem cromados, pneus e sujeira).
  const bins = new Map<string, { area: number; r: number; g: number; b: number }>();
  for (const t of tris) {
    const l = luminance(t.r, t.g, t.b);
    const cy = (sy * (t.p[1]! + t.p[4]! + t.p[7]!)) / 3;
    const upper = cy > (sy > 0 ? midY : -midY);
    if (!upper && Math.abs(t.nx) > 0.6 && t.cov > 0.3 && l > 0.1 && l < 0.85) {
      const key = [t.r, t.g, t.b].map((v) => Math.floor(v / 24)).join(',');
      let bin = bins.get(key);
      if (!bin) bins.set(key, (bin = { area: 0, r: 0, g: 0, b: 0 }));
      bin.area += t.area;
      bin.r += t.r * t.area;
      bin.g += t.g * t.area;
      bin.b += t.b * t.area;
    }
    const edge = Math.max(
      Math.hypot(t.p[3]! - t.p[0]!, t.p[4]! - t.p[1]!, t.p[5]! - t.p[2]!),
      Math.hypot(t.p[6]! - t.p[0]!, t.p[7]! - t.p[1]!, t.p[8]! - t.p[2]!),
    );
    const n = Math.min(40, Math.max(1, Math.ceil(edge / 0.05)));
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n - i; j++) {
        const a = i / n,
          c = j / n,
          w = 1 - a - c;
        samples.push({
          x: t.p[0]! * w + t.p[3]! * a + t.p[6]! * c,
          y: sy * (t.p[1]! * w + t.p[4]! * a + t.p[7]! * c),
          z: sz * (t.p[2]! * w + t.p[5]! * a + t.p[8]! * c),
        });
      }
  }

  const length = z1 - z0;
  const big = meta.kind === 'bus' || meta.kind === 'truck' || meta.kind === 'fire';
  const radius = big ? 0.5 : meta.kind === 'van' ? 0.36 : 0.32;
  const minY = minOf(samples, (s) => s.y);
  const clearance = radius * 0.55;
  const zMin = minOf(samples, (s) => s.z),
    zMax = maxOf(samples, (s) => s.z);

  // Fatias: teto, base, cintura e larguras. A cintura é onde a lateral estreita (começo da cabine);
  // em veículos altos de lateral reta (ônibus, van), uma faixa de janelas na metade de cima.
  const tall = meta.kind === 'bus' || meta.kind === 'van';
  const frontCabOnly = meta.kind === 'truck' || meta.kind === 'fire';
  const raw: CarSlice[] = [];
  for (let k = 0; k < SLICES; k++) {
    const a = zMin + ((zMax - zMin) * k) / SLICES,
      b = zMin + ((zMax - zMin) * (k + 1)) / SLICES;
    const ss = samples.filter((s) => s.z >= a && s.z <= b);
    if (!ss.length) continue;
    const roof = maxOf(ss, (s) => s.y);
    const bottom = minOf(ss, (s) => s.y);
    const span = roof - bottom;
    const step = 0.03;
    const nb = Math.max(1, Math.ceil(span / step));
    const widths = new Float32Array(nb);
    for (const s of ss) {
      const bi = Math.min(nb - 1, Math.floor((s.y - bottom) / step));
      widths[bi] = Math.max(widths[bi]!, Math.abs(s.x));
    }
    let halfWidth = 0;
    for (let i = 0; i < Math.ceil(nb * 0.55); i++) halfWidth = Math.max(halfWidth, widths[i]!);
    let belt = roof;
    for (let i = Math.floor(nb * 0.4); i < nb - 2; i++) {
      if (widths[i]! > 0 && widths[i]! < halfWidth * 0.93 && widths[i + 1]! < halfWidth * 0.93) {
        belt = bottom + i * step;
        break;
      }
    }
    if (roof - belt < 0.12) belt = roof;
    const nearFront = (a + b) / 2 > zMax - (zMax - zMin) * 0.32;
    if (belt === roof && span > 1.5 && (tall || (frontCabOnly && nearFront))) belt = bottom + span * 0.5;
    // Ônibus e vans: janelas a partir do meio, mesmo que a lateral só estreite perto do teto.
    if (tall && belt < roof && belt > bottom + span * 0.7) belt = bottom + span * 0.5;
    let roofHalfWidth = halfWidth;
    if (belt < roof) {
      roofHalfWidth = 0;
      for (let i = Math.floor((belt - bottom) / step); i < nb; i++)
        roofHalfWidth = Math.max(roofHalfWidth, widths[i]!);
    }
    const lift = clearance - minY;
    raw.push({
      z: (a + b) / 2,
      bottom: bottom + lift,
      belt: belt + lift,
      roof: roof + lift,
      halfWidth,
      roofHalfWidth: Math.min(roofHalfWidth || halfWidth, halfWidth),
    });
  }
  smoothSlices(raw);
  // Pontas exatas na frente e atrás.
  const slices = [{ ...raw[0]!, z: zMin }, ...raw, { ...raw[raw.length - 1]!, z: zMax }];

  // Eixos: as rodas do Driver 2 não fazem parte da carroceria, então seguem a proporção de cada tipo.
  const L = zMax - zMin;
  const axles =
    meta.kind === 'bus'
      ? [zMax - L * 0.17, zMin + L * 0.24]
      : meta.kind === 'truck' || meta.kind === 'fire' || meta.kind === 'limo'
        ? [zMax - L * 0.2, zMin + L * 0.24]
        : [zMax - L * 0.2, zMin + L * 0.21];

  const midWidth = Math.max(...raw.map((s) => s.halfWidth));
  const top = [...bins.values()].sort((p, q) => q.area - p.area)[0];
  const color: [number, number, number] = top
    ? boost([top.r / top.area, top.g / top.area, top.b / top.area])
    : [150, 150, 150];

  return {
    id,
    name: meta.name,
    kind: meta.kind,
    length: round2(length),
    width: round2(x1 - x0),
    height: round2(Math.max(...slices.map((s) => s.roof))),
    slices: slices.map((s) => ({
      z: round2(s.z),
      bottom: round2(s.bottom),
      belt: round2(s.belt),
      roof: round2(s.roof),
      halfWidth: round2(s.halfWidth),
      roofHalfWidth: round2(s.roofHalfWidth),
    })),
    wheels: {
      radius,
      axles: axles.map(round2),
      track: round2(midWidth * 0.86),
    },
    colors: [meta.color ?? color, ...(meta.extraColors ?? [])],
    livery: meta.livery,
    face: meta.face,
    maxKmh: meta.maxKmh,
  };
}
