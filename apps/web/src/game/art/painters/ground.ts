import { A_CUT, A_SOLID, A_TINT, hex, mix, Px, rng, shade, type Rgb } from '../pixels';

export function asphalt(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#46474b'), A_SOLID).noise(8, 0.08, r).noise(32, 0.05, r).grain(0.06, r);
  for (let i = 0; i < 260; i++) p.set(r() * 128, r() * 128, hex('#6a6b6f'), A_SOLID);
  for (let i = 0; i < 120; i++) p.set(r() * 128, r() * 128, hex('#2c2d30'), A_SOLID);
  // Rachaduras finas.
  for (let k = 0; k < 3; k++) {
    let x = r() * 128,
      y = r() * 128;
    for (let s = 0; s < 40; s++) {
      p.set(x, y, hex('#2a2a2d'), A_SOLID);
      x += r() * 2 - 0.6;
      y += r() * 2 - 1;
    }
  }
  return p;
}

export function sidewalk(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#b9b5ad'), A_SOLID);
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const k = 0.94 + r() * 0.1;
      p.rect(i * 32, j * 32, 32, 32, shade(hex('#b9b5ad'), k), A_SOLID);
    }
  for (let i = 0; i < 128; i += 32) {
    p.rect(i, 0, 1, 128, hex('#8e8a83'), A_SOLID);
    p.rect(0, i, 128, 1, hex('#8e8a83'), A_SOLID);
  }
  return p.noise(16, 0.05, r).grain(0.05, r);
}

/** Calçadão de Copacabana: ondas pretas e brancas. */
export function calcadao(seed: number): Px {
  const r = rng(seed);
  const p = new Px();
  const white = hex('#e6e1d6'),
    black = hex('#2a2a2a');
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const wave = y + 10 * Math.sin((x / 64) * Math.PI * 2);
      const band = Math.floor((wave + 128) / 16) % 2;
      p.set(x, y, band ? black : white, A_SOLID);
    }
  // Pedras portuguesas: pequenas juntas.
  for (let y = 0; y < 128; y += 4)
    for (let x = (y / 4) % 2 ? 2 : 0; x < 128; x += 4) p.blend(x, y, hex('#777'), 0.35);
  return p.grain(0.05, r);
}

export function plaza(seed: number): Px {
  const r = rng(seed);
  const p = new Px();
  const a = hex('#aaa59b'),
    b = hex('#99948a');
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 8; i++)
      p.rect(i * 16, j * 16, 16, 16, shade((i + j) % 2 ? a : b, 0.95 + r() * 0.08), A_SOLID);
  for (let i = 0; i < 128; i += 16) {
    p.rect(i, 0, 1, 128, hex('#7d786f'), A_SOLID);
    p.rect(0, i, 128, 1, hex('#7d786f'), A_SOLID);
  }
  return p.grain(0.05, r);
}

/** Lateral do meio-fio: borda clara em cima, concreto mais escuro embaixo. */
export function curb(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#8f8c86'), A_SOLID);
  p.rect(0, 0, 128, 40, hex('#cfcbc3'), A_SOLID);
  for (let x = 0; x < 128; x += 32) p.rect(x, 0, 1, 128, hex('#6c6964'), A_SOLID);
  return p.grain(0.06, r);
}

export function grass(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#4c7a2f'), A_SOLID).noise(8, 0.12, r).noise(32, 0.08, r);
  for (let i = 0; i < 700; i++) {
    const x = r() * 128,
      y = r() * 128;
    const c = r() > 0.5 ? hex('#6b9a3e') : hex('#36591f');
    p.set(x, y, c, A_SOLID);
    p.set(x, y - 1, c, A_SOLID);
  }
  return p.grain(0.04, r);
}

export function sand(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#dcc797'), A_SOLID).noise(16, 0.05, r).grain(0.07, r);
  for (let i = 0; i < 200; i++) p.set(r() * 128, r() * 128, hex('#b9a274'), A_SOLID);
  for (let i = 0; i < 120; i++) p.set(r() * 128, r() * 128, hex('#f2e6c2'), A_SOLID);
  return p;
}

export function dirt(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#7b5b3b'), A_SOLID).noise(8, 0.12, r).noise(32, 0.08, r).grain(0.08, r);
  for (let i = 0; i < 90; i++) p.disc(r() * 128, r() * 128, 1 + r() * 1.5, hex('#9a8466'), A_SOLID);
  return p;
}

export function water(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#2f5f8c'), A_SOLID).noise(8, 0.1, r);
  for (let i = 0; i < 60; i++) {
    const x = r() * 128,
      y = r() * 128,
      len = 4 + r() * 10;
    p.line(x, y, x + len, y, mix(hex('#2f5f8c'), hex('#9cc4e4'), 0.5 + r() * 0.4), A_SOLID);
  }
  return p.grain(0.03, r);
}

export function rock(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#6f6b63'), A_SOLID).noise(4, 0.18, r).noise(16, 0.1, r).grain(0.06, r);
  for (let k = 0; k < 8; k++) {
    let x = r() * 128,
      y = r() * 128;
    for (let s = 0; s < 30; s++) {
      p.set(x, y, hex('#4a4740'), A_SOLID);
      x += r() * 2 - 1;
      y += r() * 1.6;
    }
  }
  return p;
}

/** Morro com mata: verde-escuro com manchas de rocha. */
export function forest(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#2f5527'), A_SOLID).noise(8, 0.2, r).noise(32, 0.12, r);
  for (let i = 0; i < 500; i++)
    p.disc(r() * 128, r() * 128, 1 + r() * 2, r() > 0.5 ? hex('#3f6d30') : hex('#24421d'), A_SOLID);
  for (let i = 0; i < 12; i++) p.disc(r() * 128, r() * 128, 3 + r() * 4, hex('#77746b'), A_SOLID);
  return p.grain(0.05, r);
}

export function marking(seed: number): Px {
  const r = rng(seed);
  return new Px().fill(hex('#e9e7dd'), A_SOLID).grain(0.08, r);
}

export function markingYellow(seed: number): Px {
  const r = rng(seed);
  return new Px().fill(hex('#e8c33a'), A_SOLID).grain(0.08, r);
}

/** Faixa de pedestre: listras brancas com recorte transparente entre elas. */
export function crosswalk(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#000000'), A_CUT);
  for (let x = 0; x < 128; x += 32) p.rect(x + 4, 0, 20, 128, hex('#e9e7dd'), A_SOLID);
  return p.grain(0.06, r);
}

export function concrete(seed: number): Px {
  const r = rng(seed);
  return new Px().fill(hex('#9d9a93'), A_TINT).noise(8, 0.08, r).grain(0.06, r);
}

export const GROUND_COLORS: Record<string, Rgb> = {
  road: hex('#46474b'),
  sidewalk: hex('#b9b5ad'),
  plaza: hex('#a49f95'),
  sand: hex('#dcc797'),
  dirt: hex('#7b5b3b'),
  grass: hex('#4c7a2f'),
  water: hex('#2f5f8c'),
};
