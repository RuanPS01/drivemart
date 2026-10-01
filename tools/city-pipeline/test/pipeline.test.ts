import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latticeNodes } from '@drivemart/shared';
import { runPipeline, type CityConfig } from '../src/pipeline';
import { fixtureVrml } from './fixture';

const cfg: CityConfig = {
  cityId: 'teste',
  name: 'Cidade de teste',
  source: 'fixture',
  archiveFolder: '',
  unitsPerMeter: 164,
  chunkSize: 128,
};

describe('runPipeline (cidade de teste)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'drivemart-'));
  writeFileSync(join(dir, 'level.wrl'), fixtureVrml());
  const { layout, lots } = runPipeline(dir, cfg, join(dir, 'ids.lock.json'));

  it('gera polígonos de chão unidos por material', () => {
    const polys = Object.values(layout.chunks).flatMap((c) => c.g);
    const mats = new Set(polys.map((p) => layout.materials[p.m]));
    expect(mats).toEqual(new Set(['road', 'sidewalk']));
    const sidewalk = polys.filter((p) => layout.materials[p.m] === 'sidewalk');
    expect(sidewalk.every((p) => p.y === 0.1)).toBe(true);
  });

  it('cria um lote atrás do painel com a fachada voltada para a rua e zona na pista', () => {
    expect(lots).toHaveLength(1);
    const lot = layout.lots[0]!;
    expect(lot.id).toMatch(/^teste-[0-9a-z]{6}$/);
    expect(lot.n[0]).toBeCloseTo(-1, 3); // fachada olha para oeste (rua)
    expect(lot.h).toBeCloseTo(9, 1);
    expect(lot.fl).toBe(3);
    // O terreno fica a leste da fachada (x >= 6).
    for (let i = 0; i < lot.p.length; i += 2) expect(lot.p[i]!).toBeGreaterThanOrEqual(5.9);
    expect(lot.z).not.toBeNull();
    const [zx, zz] = lot.z!;
    expect(Math.abs(zx)).toBeLessThan(3); // dentro da pista
    expect(Math.abs(zz)).toBeLessThan(1);
    expect(lot.pr).toBeGreaterThan(0);
  });

  it('mantém o ID estável ao rodar de novo', () => {
    const again = runPipeline(dir, cfg, join(dir, 'ids.lock.json'));
    expect(again.layout.lots[0]!.id).toBe(layout.lots[0]!.id);
  });

  it('registra props, grade de pistas e ponto de partida na rua', () => {
    expect(layout.props).toHaveLength(5);
    const nodes = latticeNodes(layout.roads);
    expect(nodes.x.length).toBeGreaterThan(8);
    // Células de 5 m sobre a rua de 6 m: o centro fica a no máximo meia célula da borda (|x| <= 3 + 2,5).
    for (const x of nodes.x) expect(Math.abs(x)).toBeLessThanOrEqual(5.5);
    expect(Math.abs(layout.spawn[0])).toBeLessThanOrEqual(5.5);
  });
});
