import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CarCatalog, CarSpec } from '@drivemart/shared';
import { handlingFor, HANDLING } from './Car';
import { buildCarBody, buildWheel, carProfile, FALLBACK_CAR } from './carModel';

function catalog(city: string): CarSpec[] {
  const file = fileURLToPath(new URL(`../../../../../packages/city-data/${city}/cars.json`, import.meta.url));
  return (JSON.parse(readFileSync(file, 'utf8')) as CarCatalog).cars;
}

const ALL = [...catalog('rio'), ...catalog('sf'), FALLBACK_CAR];
const byId = (id: string) => ALL.find((c) => c.id === id)!;

function bounds(spec: CarSpec) {
  const m = buildCarBody(spec, spec.colors[0]!);
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.position.length; i += 3)
    for (let k = 0; k < 3; k++) {
      b[k] = Math.min(b[k]!, m.position[i + k]!);
      b[k + 3] = Math.max(b[k + 3]!, m.position[i + k]!);
    }
  return { m, b };
}

describe('catálogos de carros', () => {
  it('cada cidade tem a sua frota, com nomes e cores', () => {
    for (const city of ['rio', 'sf']) {
      const cars = catalog(city);
      expect(cars.length).toBeGreaterThanOrEqual(7);
      expect(new Set(cars.map((c) => c.id)).size).toBe(cars.length);
      for (const c of cars) {
        expect(c.id.startsWith(`${city}-`)).toBe(true);
        expect(c.colors.length).toBeGreaterThan(0);
        expect(c.wheels.axles.every((a) => Math.abs(a) < c.length / 2)).toBe(true);
      }
    }
  });
});

describe('buildCarBody', () => {
  it.each(ALL.map((c) => [c.id, c] as const))('%s: malha válida do tamanho do carro', (_id, spec) => {
    const { m, b } = bounds(spec);
    expect(m.index.length / 3).toBeGreaterThan(100);
    expect(m.position.every(Number.isFinite)).toBe(true);
    expect(Math.max(...m.index)).toBeLessThan(m.position.length / 3);
    // Comprimento e largura batem com o catálogo (para-choques e faixas passam poucos centímetros).
    expect(b[5]! - b[2]!).toBeGreaterThan(spec.length - 0.05);
    expect(b[5]! - b[2]!).toBeLessThan(spec.length + 0.2);
    expect(b[3]! - b[0]!).toBeLessThan(spec.width + 0.12);
    expect(b[1]!).toBeGreaterThan(0.05);
    // Teto no máximo um pouco acima do perfil (giroflex, placa de táxi, escada).
    expect(b[4]!).toBeLessThan(spec.height + 0.3);
  });

  it('acessórios das pinturas de serviço ficam acima do teto', () => {
    for (const id of ['sf-police', 'sf-taxi', 'rio-0', 'rio-7']) {
      const spec = byId(id);
      expect(bounds(spec).b[4]!).toBeGreaterThan(spec.height + 0.08);
    }
    expect(bounds(byId('sf-sedan')).b[4]!).toBeCloseTo(byId('sf-sedan').height, 1);
  });

  it('a cor do carro vai para a tinta dos vértices', () => {
    const spec = byId('sf-taxi');
    const m = buildCarBody(spec, [236, 186, 30]);
    let yellow = 0;
    for (let i = 0; i < m.tint.length; i += 3) if (m.tint[i]! > 100 && m.tint[i + 2]! < 40) yellow++;
    expect(yellow).toBeGreaterThan(50);
  });

  it('roda com o raio pedido', () => {
    const w = buildWheel(0.5, 0.34);
    let r = 0;
    for (let i = 0; i < w.position.length; i += 3)
      r = Math.max(r, Math.hypot(w.position[i]!, w.position[i + 2]!));
    expect(r).toBeCloseTo(0.5, 3);
  });
});

describe('carProfile', () => {
  it('acha a cabine do sedã entre o capô e o porta-malas', () => {
    const p = carProfile(byId('sf-sedan'));
    expect(p.cabin).not.toBeNull();
    expect(p.cabin!.z1).toBeLessThan(p.zMax - 1);
    expect(p.cabin!.z0).toBeGreaterThan(p.zMin + 1);
  });

  it('ônibus tem janelas no comprimento todo; picape e caminhão só na frente', () => {
    const bus = carProfile(byId('rio-5'));
    expect(bus.cabin!.z1 - bus.cabin!.z0).toBeGreaterThan((bus.zMax - bus.zMin) * 0.8);
    for (const id of ['rio-6', 'sf-pickup', 'rio-7', 'rio-9']) {
      const p = carProfile(byId(id));
      expect(p.cabin!.rearBase - p.zMin, id).toBeGreaterThan(0.8);
    }
  });
});

describe('handlingFor', () => {
  it('ônibus é mais pesado e mais lento; a velocidade máxima vem do catálogo', () => {
    const sedan = handlingFor(byId('sf-sedan'));
    const bus = handlingFor(byId('rio-5'));
    expect(bus.mass).toBeGreaterThan(sedan.mass * 2.5);
    expect(bus.maxSpeed).toBeLessThan(sedan.maxSpeed);
    expect(sedan.maxSpeed).toBeCloseTo(byId('sf-sedan').maxKmh / 3.6, 5);
    // Força proporcional à massa: aceleração parecida com a do carro de referência.
    expect(sedan.engineForce / sedan.mass).toBeCloseTo(HANDLING.engineForce / HANDLING.mass, 5);
  });
});
