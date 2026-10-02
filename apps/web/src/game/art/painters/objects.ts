import { A_CUT, A_GLOW, A_SOLID, hex, mix, Px, rng, shade } from '../pixels';

export function metal(seed: number): Px {
  const r = rng(seed);
  const p = new Px();
  for (let x = 0; x < 128; x++) {
    const k = 0.7 + 0.5 * Math.sin((x / 128) * Math.PI);
    for (let y = 0; y < 128; y++) p.set(x, y, shade(hex('#7d8288'), k), A_SOLID);
  }
  return p.grain(0.04, r);
}

export function lamp(seed: number): Px {
  const r = rng(seed);
  return new Px().fill(hex('#f4e9c4'), A_GLOW).noise(4, 0.08, r);
}

export function trafficLight(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#202224'), A_SOLID);
  const cols = [hex('#e23b2e'), hex('#f0b429'), hex('#33c45a')];
  cols.forEach((c, i) => {
    p.disc(64, 22 + i * 42, 15, hex('#0d0d0d'), A_SOLID);
    p.disc(64, 22 + i * 42, 12, i === 0 ? c : shade(c, 0.35), i === 0 ? A_GLOW : A_SOLID);
  });
  return p.grain(0.03, r);
}

export function coneStripes(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#f06a1d'), A_SOLID);
  for (const y of [30, 70]) p.rect(0, y, 128, 16, hex('#f2f2ee'), A_SOLID);
  return p.grain(0.05, r);
}

export function barrierStripes(seed: number): Px {
  const r = rng(seed);
  const p = new Px();
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++)
      p.set(x, y, Math.floor((x + y) / 16) % 2 ? hex('#d23a2c') : hex('#efefe9'), A_SOLID);
  return p.grain(0.05, r);
}

export function wood(seed: number): Px {
  const r = rng(seed);
  const p = new Px();
  for (let y = 0; y < 128; y++) {
    const plank = Math.floor(y / 16);
    const base = shade(hex('#9c7247'), 0.85 + ((plank * 37) % 10) / 40);
    for (let x = 0; x < 128; x++)
      p.set(x, y, shade(base, 1 + 0.08 * Math.sin(x * 0.3 + plank * 5 + y * 0.1)), A_SOLID);
    if (y % 16 === 0) p.rect(0, y, 128, 1, hex('#4d3721'), A_SOLID);
  }
  return p.grain(0.05, r);
}

export function canvasStripes(seed: number): Px {
  const r = rng(seed);
  const colors = [hex('#d8323a'), hex('#1f73c6'), hex('#2a9d55'), hex('#f2b318')];
  const c = colors[Math.floor(r() * colors.length)]!;
  const p = new Px();
  for (let x = 0; x < 128; x++) {
    const col = Math.floor(x / 16) % 2 ? c : hex('#f1eee6');
    for (let y = 0; y < 128; y++) p.set(x, y, col, A_SOLID);
  }
  return p.grain(0.04, r);
}

export function plasticGreen(seed: number): Px {
  const r = rng(seed);
  return new Px().fill(hex('#2e7d3e'), A_SOLID).noise(4, 0.1, r).grain(0.04, r);
}

/** Palmeira-imperial: tronco anelado e copa de folhas (recorte). */
export function palm(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#000000'), A_CUT);
  for (let y = 40; y < 128; y++) {
    const cx = 64 + Math.sin(y / 30) * 2;
    const w = 3 + (y - 40) / 40;
    for (let x = Math.floor(cx - w); x <= cx + w; x++) {
      const ring = y % 5 === 0 ? 0.7 : 1;
      p.set(x, y, shade(mix(hex('#8b7355'), hex('#a89878'), (x - cx + w) / (2 * w)), ring), A_SOLID);
    }
  }
  for (let k = 0; k < 14; k++) {
    const ang = (k / 14) * Math.PI * 2 + r() * 0.3;
    const len = 34 + r() * 18;
    for (let s = 0; s < len; s++) {
      const t = s / len;
      const x = 64 + Math.cos(ang) * s;
      const y = 40 + Math.sin(ang) * s * 0.55 + t * t * 26;
      const c = shade(mix(hex('#5f9a3a'), hex('#2f5f22'), t), 0.85 + r() * 0.3);
      p.set(x, y, c, A_SOLID);
      p.set(x, y + 1, c, A_SOLID);
      if (s % 3 === 0) {
        p.set(x + 1, y + 2, shade(c, 0.8), A_SOLID);
        p.set(x - 1, y + 2, shade(c, 0.8), A_SOLID);
      }
    }
  }
  return p;
}

/** Árvore de copa arredondada (amendoeira). */
export function tree(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#000000'), A_CUT);
  for (let y = 70; y < 128; y++)
    for (let x = 58; x < 70; x++) p.set(x, y, shade(hex('#6b4f33'), 0.8 + (x - 58) / 30), A_SOLID);
  for (let k = 0; k < 260; k++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()) * 46;
    const x = 64 + Math.cos(a) * d,
      y = 50 + Math.sin(a) * d * 0.75;
    const light = 1 - (y - 10) / 110;
    p.disc(
      x,
      y,
      4 + r() * 4,
      shade(mix(hex('#2d5a22'), hex('#5d9440'), light * 0.8 + r() * 0.2), 0.9 + r() * 0.2),
      A_SOLID,
    );
  }
  return p;
}

export function bush(seed: number): Px {
  const r = rng(seed);
  const p = new Px().fill(hex('#000000'), A_CUT);
  for (let k = 0; k < 160; k++) {
    const a = r() * Math.PI * 2,
      d = Math.sqrt(r()) * 50;
    const x = 64 + Math.cos(a) * d,
      y = 84 + Math.sin(a) * d * 0.6;
    const c = r() < 0.08 ? hex('#d9488a') : mix(hex('#2f6125'), hex('#6aa548'), r());
    p.disc(x, y, 3 + r() * 4, c, A_SOLID);
  }
  return p;
}
