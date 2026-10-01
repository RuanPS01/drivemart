import { A_GLOW, A_SOLID, A_TINT, hex, mix, Px, rng, shade, type Rgb } from '../pixels';

/**
 * Fachadas: cada camada cobre 6,4 m x 6,4 m (2 vãos x 2 andares, células de 64 px).
 * Paredes usam alfa TINT (recebem a cor do prédio); vidros usam GLOW (acendem à noite).
 */

function glass(
  p: Px,
  x: number,
  y: number,
  w: number,
  h: number,
  r: () => number,
  base = hex('#2b3946'),
): void {
  const top = mix(base, hex('#6f8fa6'), 0.35);
  for (let j = 0; j < h; j++) {
    const c = mix(top, base, j / h);
    for (let i = 0; i < w; i++) p.set(x + i, y + j, c, A_GLOW);
  }
  // Reflexo diagonal.
  const off = Math.floor(r() * w);
  for (let j = 0; j < h; j++) {
    const xx = x + ((off + j) % (w + 6)) - 3;
    if (xx >= x && xx < x + w - 2) {
      p.blend(xx, y + j, hex('#c8dbe6'), 0.35);
      p.blend(xx + 1, y + j, hex('#c8dbe6'), 0.25);
    }
  }
  // Cortina ou persiana em parte das janelas.
  if (r() < 0.35) {
    const cc = [hex('#c9b48a'), hex('#d8d2c2'), hex('#a65e4e'), hex('#7d8b6a')][Math.floor(r() * 4)]!;
    const ch = Math.floor(h * (0.3 + r() * 0.5));
    for (let j = 0; j < ch; j++)
      for (let i = 0; i < w; i++) p.set(x + i, y + j, shade(cc, 0.85 + (i % 4 === 0 ? -0.1 : 0)), A_GLOW);
  }
}

function windowCell(
  p: Px,
  cx: number,
  cy: number,
  r: () => number,
  opts: { w?: number; h?: number; frame?: Rgb; sill?: boolean; balcony?: boolean } = {},
): void {
  const w = opts.w ?? 34,
    h = opts.h ?? 30;
  const x = cx + Math.floor((64 - w) / 2),
    y = cy + 13;
  glass(p, x, y, w, h, r);
  const frame = opts.frame ?? hex('#d4d1c8');
  p.frame(x - 2, y - 2, w + 4, h + 4, 2, frame, A_SOLID);
  p.rect(x + Math.floor(w / 2) - 1, y, 2, h, frame, A_SOLID);
  if (opts.sill !== false) p.rect(x - 4, y + h + 2, w + 8, 3, shade(frame, 0.75), A_SOLID);
  if (opts.balcony) {
    p.rect(x - 6, y + h - 2, w + 12, 4, hex('#bdb8ad'), A_SOLID);
    p.rect(x - 6, y + h - 14, w + 12, 2, hex('#2f2f2f'), A_SOLID);
    for (let i = x - 6; i < x + w + 6; i += 4) p.rect(i, y + h - 14, 1, 12, hex('#2f2f2f'), A_SOLID);
  }
}

function floorBands(p: Px, color: Rgb): void {
  for (const y of [61, 125]) p.rect(0, y, 128, 3, color, A_TINT);
}

export function facadeConcrete(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#a3a09a')).noise(8, 0.06, r);
  for (let x = 0; x < 128; x += 32) p.rect(x, 0, 1, 128, hex('#8d8a84'));
  floorBands(p, hex('#8a8781'));
  for (const cy of [0, 64]) for (const cx of [0, 64]) windowCell(p, cx, cy, r);
  return p.grain(0.04, r);
}

export function facadeBrick(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#b5a593'));
  for (let y = 0; y < 128; y += 5) {
    const off = (y / 5) % 2 ? 6 : 0;
    for (let x = -12; x < 128; x += 12) p.rect(x + off, y, 11, 4, shade(hex('#9a5137'), 0.88 + r() * 0.2));
  }
  for (const cy of [0, 64])
    for (const cx of [0, 64]) windowCell(p, cx, cy, r, { frame: hex('#e7e2d6'), w: 30, h: 34 });
  return p.grain(0.05, r);
}

/** Pastilhas pequenas com varandas (prédio residencial típico do Rio). */
export function facadeTile(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#cfc9bb'));
  for (let y = 0; y < 128; y += 4)
    for (let x = 0; x < 128; x += 4) p.rect(x, y, 3, 3, shade(hex('#ddd7c9'), 0.95 + r() * 0.08));
  floorBands(p, hex('#b4ae9f'));
  for (const cy of [0, 64])
    for (const cx of [0, 64]) windowCell(p, cx, cy, r, { balcony: true, sill: false, h: 32 });
  return p.grain(0.03, r);
}

export function facadeGlass(seed: number): Px {
  const r = rng(seed);
  const p = new Px();
  for (const cy of [0, 64]) {
    for (let j = 0; j < 56; j++) {
      const c = mix(hex('#5f8aa0'), hex('#1f3a4b'), j / 56);
      for (let x = 0; x < 128; x++) p.set(x, cy + j, c, A_GLOW);
    }
    p.rect(0, cy + 56, 128, 8, hex('#33424c'), A_SOLID);
  }
  for (let x = 0; x < 128; x += 32) p.rect(x, 0, 3, 128, hex('#c3cbce'), A_SOLID);
  for (let k = 0; k < 6; k++) {
    const x0 = r() * 128;
    for (let j = 0; j < 128; j++) p.blend(x0 + j * 0.6, j, hex('#d6e6ee'), 0.25);
  }
  return p.grain(0.03, r);
}

/** Casario colonial: reboco claro, janelas altas com venezianas. */
export function facadeColonial(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#ddcba6')).noise(8, 0.07, r);
  const shutter = [hex('#4d7a5c'), hex('#3d5f86'), hex('#8a4a36')][Math.floor(r() * 3)]!;
  for (const cy of [0, 64]) {
    p.rect(0, cy, 128, 4, hex('#efe4cc'));
    p.rect(0, cy + 4, 128, 1, hex('#a8977a'));
    for (const cx of [0, 64]) {
      const x = cx + 20,
        y = cy + 10;
      glass(p, x, y, 24, 44, r, hex('#2d2a26'));
      p.frame(x - 3, y - 3, 30, 50, 3, hex('#f3ecdc'), A_SOLID);
      if (r() < 0.6) {
        for (let j = 0; j < 44; j += 3) {
          p.rect(x - 11, y + j, 8, 2, shutter, A_SOLID);
          p.rect(x + 27, y + j, 8, 2, shutter, A_SOLID);
        }
      } else {
        for (let j = 0; j < 44; j += 3) p.rect(x, y + j, 24, 2, shutter, A_SOLID);
      }
      p.rect(x - 4, y + 46, 32, 2, hex('#2b2b2b'), A_SOLID);
    }
  }
  return p.grain(0.05, r);
}

/** Prédio moderno branco com janelas em faixa (estilo orla de Copacabana). */
export function facadeModern(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#e3e1da')).noise(8, 0.04, r);
  for (const cy of [0, 64]) {
    for (let j = 0; j < 26; j++) {
      const c = mix(hex('#4e6c80'), hex('#22323d'), j / 26);
      for (let x = 0; x < 128; x++) p.set(x, cy + 18 + j, c, A_GLOW);
    }
    for (let x = 0; x < 128; x += 16) p.rect(x, cy + 18, 2, 26, hex('#d9d9d2'), A_SOLID);
    p.rect(0, cy + 44, 128, 4, hex('#c4c2ba'));
    p.rect(0, cy + 52, 128, 2, hex('#3a3a3a'), A_SOLID);
  }
  return p.grain(0.03, r);
}

/** Lateral cega com poucas janelas pequenas. */
export function facadeSide(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#aaa59c')).noise(4, 0.08, r).noise(16, 0.05, r);
  for (let k = 0; k < 3; k++) {
    const x = Math.floor(r() * 4) * 32 + 8,
      y = Math.floor(r() * 4) * 32 + 8;
    glass(p, x, y, 14, 16, r);
    p.frame(x - 1, y - 1, 16, 18, 1, hex('#cfccc4'), A_SOLID);
  }
  // Manchas de umidade escorrendo.
  for (let k = 0; k < 5; k++) {
    const x = r() * 128;
    for (let j = 0; j < 60 + r() * 60; j++) p.blend(x + Math.sin(j * 0.2), j, hex('#6f6a60'), 0.25);
  }
  return p.grain(0.05, r);
}

export function roof(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#7c7972'), A_SOLID).noise(16, 0.08, r).grain(0.12, r);
  for (let k = 0; k < 3; k++) {
    const x = r() * 100,
      y = r() * 100;
    p.rect(x, y, 14, 10, hex('#b8b6b0'), A_SOLID);
    p.rect(x + 2, y + 2, 10, 6, hex('#5d5b57'), A_SOLID);
  }
  return p;
}

const SIGN_COLORS = [
  hex('#c0392b'),
  hex('#1f6fb2'),
  hex('#2e8b57'),
  hex('#e0a526'),
  hex('#8e44ad'),
  hex('#d35400'),
];

/** Térreo comercial: cobre 6,4 m de largura x 4 m de altura. */
export function shopGlass(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#a7a39c'));
  const sign = SIGN_COLORS[Math.floor(r() * SIGN_COLORS.length)]!;
  p.rect(0, 6, 128, 20, sign, A_SOLID);
  p.rect(0, 26, 128, 3, hex('#3a3a3a'), A_SOLID);
  glass(p, 4, 34, 120, 82, r, hex('#26313a'));
  for (const x of [4, 44, 84, 123]) p.rect(x, 34, 3, 82, hex('#5b5f63'), A_SOLID);
  p.rect(52, 52, 24, 64, hex('#1d2329'), A_GLOW);
  p.rect(0, 116, 128, 12, hex('#3f3f42'), A_SOLID);
  return p.grain(0.04, r);
}

export function shopAwning(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#b0aba2'));
  const c = SIGN_COLORS[Math.floor(r() * SIGN_COLORS.length)]!;
  for (let x = 0; x < 128; x++) {
    const stripe = Math.floor(x / 8) % 2 ? c : hex('#efece4');
    for (let y = 18; y < 40; y++) p.set(x, y, shade(stripe, 1 - (y - 18) * 0.008), A_SOLID);
    const sc = 40 + Math.round(3 * Math.abs(Math.sin((x / 8) * Math.PI)));
    for (let y = 40; y < sc; y++) p.set(x, y, stripe, A_SOLID);
  }
  glass(p, 6, 48, 116, 70, r, hex('#2a2f33'));
  p.rect(0, 118, 128, 10, hex('#45413d'), A_SOLID);
  return p.grain(0.04, r);
}

export function shopShutter(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#a39f97'));
  const sign = SIGN_COLORS[Math.floor(r() * SIGN_COLORS.length)]!;
  p.rect(0, 8, 128, 18, sign, A_SOLID);
  for (let y = 34; y < 122; y++) {
    const k = y % 4 === 0 ? 0.7 : 0.92 + (y % 4) * 0.03;
    p.rect(6, y, 116, 1, shade(hex('#9aa0a4'), k), A_SOLID);
  }
  p.rect(6, 34, 116, 2, hex('#55595c'), A_SOLID);
  // Pichações discretas.
  for (let k = 0; k < 2; k++) {
    let x = 20 + r() * 80,
      y = 60 + r() * 40;
    const c = [hex('#2b2b2b'), hex('#b03a2e'), hex('#2e6db0')][k]!;
    for (let s = 0; s < 30; s++) {
      p.set(x, y, c, A_SOLID);
      x += r() * 2 - 0.6;
      y += Math.sin(s) * 1.2;
    }
  }
  return p.grain(0.04, r);
}

export function shopLobby(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#b9b3a7')).noise(8, 0.05, r);
  p.rect(0, 20, 128, 6, hex('#5a5550'), A_SOLID);
  glass(p, 46, 40, 36, 78, r, hex('#2c3a42'));
  p.frame(44, 38, 40, 82, 2, hex('#c9c3b5'), A_SOLID);
  p.rect(63, 40, 2, 78, hex('#c9c3b5'), A_SOLID);
  for (const x of [10, 94]) {
    glass(p, x, 50, 24, 40, r);
    p.frame(x - 2, 48, 28, 44, 2, hex('#d4d1c8'), A_SOLID);
  }
  p.rect(0, 118, 128, 10, hex('#7c776f'));
  return p.grain(0.04, r);
}
