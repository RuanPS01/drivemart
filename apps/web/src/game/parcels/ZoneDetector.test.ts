import { describe, expect, it } from 'vitest';
import type { LayoutLot } from '@drivemart/shared';
import { insideZone, ParcelIndex } from './ParcelIndex';
import { ZoneDetector } from './ZoneDetector';

const lot: LayoutLot = {
  id: 'rio-zona01',
  p: [6, -6, 6, 6, 18, 6, 18, -6],
  f: [6, -6, 6, 6],
  n: [-1, 0],
  y: 0,
  h: 9,
  fl: 3,
  a: 144,
  c: [150, 140, 130],
  // Zona centrada em (1, 0), fachada ao longo de z (ângulo 90 graus), 8 m de largura e 5 m de profundidade.
  z: [1, 0, 0, Math.PI / 2, 8, 5],
  o: 0,
  s: 'A1',
  pr: 1000,
};

describe('zonas de ação', () => {
  it('testa ponto dentro do retângulo orientado', () => {
    expect(insideZone(lot, 1, 3.9)).toBe(true);
    expect(insideZone(lot, 1, 4.2)).toBe(false);
    expect(insideZone(lot, 3.4, 0)).toBe(true);
    expect(insideZone(lot, 3.6, 0)).toBe(false);
  });

  it('só considera parado depois do tempo mínimo abaixo da velocidade limite', () => {
    const det = new ZoneDetector(new ParcelIndex([lot]));
    expect(det.update(20, 20, 0, 0.1)).toBeNull();
    expect(det.update(1, 0, 5, 0.1)).toEqual({ lotId: lot.id, stopped: false });
    for (let i = 0; i < 5; i++) det.update(1, 0, 0.2, 0.1);
    expect(det.update(1, 0, 0.2, 0.1)).toEqual({ lotId: lot.id, stopped: true });
    // Sai da zona: limpa.
    expect(det.update(1, 10, 0, 0.1)).toBeNull();
  });
});
