import { A_GLOW, A_SOLID, A_TINT, hex, mix, pixelText, pixelTextWidth, Px, rng, shade } from '../pixels';

/**
 * Texturas dos carros, pintadas por código (nenhuma imagem dos jogos originais).
 * Áreas TINT recebem a cor do carro; cromados, faróis e letreiros têm cor própria.
 * Nas laterais e nas pontas, y = 0 é a linha da cintura e y = 127 é a base da carroceria.
 */

const CHROME = hex('#d9dde2');
const CHROME_DARK = hex('#8c9197');
const BLACK = hex('#1c1d20');

/** Base clara com leve degradê (recebe a cor do carro). */
function paintBase(): Px {
  const p = new Px();
  for (let y = 0; y < 128; y++) {
    const k = 1.06 - (y / 128) * 0.26;
    for (let x = 0; x < 128; x++) p.set(x, y, shade(hex('#f2f2f2'), k), A_TINT);
  }
  return p;
}

function chromeBar(p: Px, y: number, h: number): void {
  for (let j = 0; j < h; j++) p.rect(0, y + j, 128, 1, mix(CHROME, CHROME_DARK, j / h), A_SOLID);
}

/** Teto, capô e porta-malas: cor do carro quase lisa. */
export function carTop(seed: number): Px {
  const p = new Px().fill(hex('#ececec'), A_TINT);
  return p.grain(0.02, rng(seed));
}

/** Lateral lisa: friso cromado perto da cintura e saia mais escura embaixo. */
export function carSide(seed: number): Px {
  const p = paintBase();
  p.rect(0, 14, 128, 2, CHROME, A_SOLID);
  p.rect(0, 112, 128, 16, shade(hex('#f2f2f2'), 0.62), A_TINT);
  return p.grain(0.02, rng(seed));
}

/** Lateral com frisos de porta e maçanetas, sobre a lateral lisa. */
export function carDoor(seed: number): Px {
  const p = carSide(seed);
  for (const x of [38, 96]) p.rect(x, 18, 1, 94, shade(hex('#f2f2f2'), 0.55), A_TINT);
  for (const x of [50, 108]) p.rect(x, 30, 9, 3, CHROME, A_SOLID);
  return p;
}

/** Vidro com reflexo diagonal. */
export function carGlass(seed: number): Px {
  const r = rng(seed);
  const p = new Px();
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) p.set(x, y, mix(hex('#5d7a8c'), hex('#18232b'), y / 128), A_SOLID);
  for (let j = 0; j < 128; j++) {
    p.blend(20 + j * 0.5, j, hex('#cfe0ea'), 0.4);
    p.blend(28 + j * 0.5, j, hex('#cfe0ea'), 0.25);
  }
  return p.grain(0.02, r);
}

/** Janelas laterais de ônibus e van: vidro com colunas na cor do carro nas bordas (repete em fila). */
export function carWindows(seed: number): Px {
  const p = carGlass(seed);
  p.rect(0, 0, 7, 128, hex('#e6e6e6'), A_TINT);
  p.rect(121, 0, 7, 128, hex('#e6e6e6'), A_TINT);
  p.rect(7, 0, 114, 4, BLACK, A_SOLID);
  p.rect(7, 124, 114, 4, BLACK, A_SOLID);
  return p;
}

/** Roda vista de lado: pneu com calota cromada. */
export function wheel(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#141414'), A_SOLID);
  p.disc(64, 64, 62, hex('#1c1c1c'), A_SOLID);
  p.disc(64, 64, 38, hex('#a9adb2'), A_SOLID);
  p.disc(64, 64, 30, hex('#d7dade'), A_SOLID);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    p.disc(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18, 4, hex('#6f7378'), A_SOLID);
  }
  p.disc(64, 64, 7, hex('#55595e'), A_SOLID);
  return p.grain(0.03, r);
}

/** Banda de rodagem do pneu (também usada nas caixas de roda e embaixo do carro). */
export function tread(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#1b1b1b'), A_SOLID);
  for (let y = 0; y < 128; y += 8)
    for (let x = 0; x < 128; x += 16) p.rect(x + ((y / 8) % 2) * 8, y, 6, 4, hex('#2b2b2b'), A_SOLID);
  return p.grain(0.04, r);
}

/** Frente anos 50/60: grade cromada larga, faróis redondos e para-choque grosso. */
export function carFrontClassic(seed: number): Px {
  const r = rng(seed);
  const p = paintBase();
  p.rect(24, 40, 80, 46, BLACK, A_SOLID);
  for (let y = 42; y < 84; y += 5) p.rect(26, y, 76, 2, CHROME, A_SOLID);
  p.rect(62, 40, 4, 46, CHROME, A_SOLID);
  for (const cx of [12, 116]) {
    p.disc(cx, 58, 12, CHROME, A_SOLID);
    p.disc(cx, 58, 9, hex('#fff4d0'), A_GLOW);
  }
  chromeBar(p, 96, 16);
  p.rect(52, 99, 24, 9, hex('#e9e4cf'), A_SOLID);
  return p.grain(0.03, r);
}

/** Frente anos 70: grade preta retangular com frisos e faróis quadrados duplos. */
export function carFront70(seed: number): Px {
  const r = rng(seed);
  const p = paintBase();
  p.rect(30, 44, 68, 40, BLACK, A_SOLID);
  for (let x = 32; x < 96; x += 6) p.rect(x, 46, 2, 36, hex('#4a4d52'), A_SOLID);
  p.frame(30, 44, 68, 40, 2, CHROME, A_SOLID);
  for (const x0 of [4, 98]) {
    p.rect(x0, 50, 26, 24, CHROME_DARK, A_SOLID);
    p.rect(x0 + 2, 52, 10, 20, hex('#fff4d0'), A_GLOW);
    p.rect(x0 + 14, 52, 10, 20, hex('#fff4d0'), A_GLOW);
  }
  chromeBar(p, 94, 12);
  return p.grain(0.03, r);
}

/** Frente de ônibus: painel liso, grade pequena, faróis baixos e para-choque preto. */
export function carFrontBus(seed: number): Px {
  const r = rng(seed);
  const p = paintBase();
  p.rect(0, 24, 128, 6, CHROME, A_SOLID);
  p.rect(40, 62, 48, 22, BLACK, A_SOLID);
  for (let y = 64; y < 82; y += 4) p.rect(42, y, 44, 2, CHROME_DARK, A_SOLID);
  for (const cx of [16, 112]) {
    p.disc(cx, 74, 9, CHROME, A_SOLID);
    p.disc(cx, 74, 7, hex('#fff4d0'), A_GLOW);
  }
  p.rect(0, 100, 128, 16, BLACK, A_SOLID);
  return p.grain(0.03, r);
}

/** Frente de caminhão: grade cromada alta e faróis redondos nas pontas. */
export function carFrontTruck(seed: number): Px {
  const r = rng(seed);
  const p = paintBase();
  p.rect(22, 16, 84, 76, BLACK, A_SOLID);
  for (let y = 18; y < 90; y += 6) p.rect(24, y, 80, 3, CHROME, A_SOLID);
  p.frame(22, 16, 84, 76, 3, CHROME, A_SOLID);
  for (const cx of [10, 118]) {
    p.disc(cx, 52, 9, CHROME, A_SOLID);
    p.disc(cx, 52, 7, hex('#fff4d0'), A_GLOW);
  }
  chromeBar(p, 100, 18);
  return p.grain(0.03, r);
}

/** Traseira anos 50/60: lanternas redondas altas (rabo de peixe), placa e para-choque. */
export function carRearClassic(seed: number): Px {
  const r = rng(seed);
  const p = paintBase();
  for (const cx of [14, 114]) {
    p.rect(cx - 6, 20, 12, 30, hex('#b81d17'), A_GLOW);
    p.disc(cx, 58, 9, CHROME, A_SOLID);
    p.disc(cx, 58, 7, hex('#d4261d'), A_GLOW);
  }
  p.rect(48, 52, 32, 16, hex('#e9e4cf'), A_SOLID);
  p.frame(48, 52, 32, 16, 1, BLACK, A_SOLID);
  chromeBar(p, 96, 16);
  return p.grain(0.03, r);
}

/** Traseira anos 70: lanternas horizontais largas. */
export function carRear70(seed: number): Px {
  const r = rng(seed);
  const p = paintBase();
  p.rect(4, 44, 46, 20, hex('#b81d17'), A_GLOW);
  p.rect(78, 44, 46, 20, hex('#b81d17'), A_GLOW);
  for (const x of [20, 36, 94, 110]) p.rect(x, 44, 1, 20, hex('#5a0b08'), A_SOLID);
  p.rect(52, 48, 24, 13, hex('#e9e4cf'), A_SOLID);
  chromeBar(p, 92, 12);
  return p.grain(0.03, r);
}

/** Xadrez do táxi. */
export function carChecker(seed: number): Px {
  const r = rng(seed);
  const p = new Px();
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++)
      p.set(x, y, (Math.floor(x / 16) + Math.floor(y / 64)) % 2 ? BLACK : hex('#f1f1ec'), A_SOLID);
  return p.grain(0.02, r);
}

/** Faixa branca (bombeiros, ônibus). */
export function carStripe(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#f1f1ec'), A_SOLID);
  p.rect(0, 0, 128, 6, CHROME_DARK, A_SOLID);
  p.rect(0, 122, 128, 6, CHROME_DARK, A_SOLID);
  return p.grain(0.02, r);
}

function lettering(text: string, scale: number, bg: string, fg: string, badge?: string): Px {
  const p = new Px().fill(hex(bg), A_SOLID);
  const w = pixelTextWidth(text, scale);
  pixelText(p, Math.round((128 - w) / 2), Math.round(64 - 2.5 * scale), text, hex(fg), scale, A_SOLID);
  if (badge) {
    p.disc(64, 26, 10, hex(badge), A_SOLID);
    p.disc(64, 26, 6, shade(hex(badge), 0.7), A_SOLID);
  }
  return p;
}

/** Porta branca da viatura de San Francisco, com distintivo. */
export function carPoliceSF(seed: number): Px {
  return lettering('POLICE', 4, '#f4f4ef', '#141414', '#d4a83a').grain(0.02, rng(seed));
}

/** Faixa da viatura do Rio. */
export function carPoliciaRio(seed: number): Px {
  return lettering('POLÍCIA', 3, '#f4f4ef', '#141414').grain(0.02, rng(seed));
}

/** Giroflex: metade vermelha, metade azul (acende à noite). */
export function carLightbar(seed: number): Px {
  const p = new Px().fill(CHROME_DARK, A_SOLID);
  p.rect(4, 20, 58, 88, hex('#e0261d'), A_GLOW);
  p.rect(66, 20, 58, 88, hex('#2a5fe0'), A_GLOW);
  return p.grain(0.02, rng(seed));
}

/** Placa de teto do táxi. */
export function carTaxiSign(seed: number): Px {
  const p = new Px().fill(hex('#f2c31f'), A_GLOW);
  const w = pixelTextWidth('TAXI', 5);
  pixelText(p, Math.round((128 - w) / 2), 52, 'TAXI', hex('#141414'), 5, A_SOLID);
  return p.grain(0.02, rng(seed));
}

/** Lataria com manchas de ferrugem (a cor do carro aparece entre as manchas). */
export function carRust(seed: number): Px {
  const r = rng(seed);
  const p = carDoor(seed);
  for (let k = 0; k < 26; k++) {
    const cx = r() * 128,
      cy = 20 + r() * 108,
      rad = 3 + r() * 9;
    p.disc(cx, cy, rad, mix(hex('#7a3f1d'), hex('#4a2a17'), r()), A_SOLID);
  }
  return p.grain(0.04, r);
}

/** Painel de madeira da perua. */
export function carWood(seed: number): Px {
  const r = rng(seed);
  const p = new Px();
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const plank = Math.floor(y / 21);
      const base = plank % 2 ? hex('#8a5a2e') : hex('#9c6a38');
      p.set(x, y, shade(base, 0.9 + 0.1 * Math.sin(x * 0.21 + plank * 3)), A_SOLID);
    }
  p.frame(0, 0, 128, 128, 6, hex('#d8c49a'), A_SOLID);
  return p.grain(0.05, r);
}
