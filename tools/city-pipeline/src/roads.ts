import type { RoadLattice } from '@drivemart/shared';
import { GROUND_MATERIALS } from './classify';
import type { Grid } from './raster';

const CODE_ROAD = GROUND_MATERIALS.indexOf('road') + 1;
// Piso de praça no nível da rua aparece no meio de cruzamentos (peças claras): também é transitável.
const CODE_PLAZA = GROUND_MATERIALS.indexOf('plaza') + 1;

/**
 * Grade de pistas a partir da máscara de asfalto (1 m): uma célula de `cell` metros é pista
 * quando ao menos 40% das subcélulas são asfalto (ou piso no nível da rua). Guarda o bitmap e a altura mediana de cada célula.
 */
export function buildRoadLattice(grid: Grid, cell = 5): RoadLattice {
  const sub = Math.round(cell / grid.cell);
  const cols = Math.ceil(grid.w / sub);
  const rows = Math.ceil(grid.h / sub);
  const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
  const heights: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let road = 0,
        total = 0;
      const hs: number[] = [];
      for (let j = r * sub; j < Math.min(grid.h, (r + 1) * sub); j++)
        for (let i = c * sub; i < Math.min(grid.w, (c + 1) * sub); i++) {
          total++;
          const idx = j * grid.w + i;
          const m = grid.mat[idx];
          if (m === CODE_ROAD || (m === CODE_PLAZA && grid.height[idx]! < 1)) {
            road++;
            hs.push(grid.height[idx]!);
          }
        }
      if (!total || road / total < 0.4) continue;
      const k = r * cols + c;
      bits[k >> 3]! |= 1 << (k & 7);
      hs.sort((a, b) => a - b);
      // Decímetros para meios metros, limitado ao Int8.
      heights.push(Math.max(-128, Math.min(127, Math.round(hs[hs.length >> 1]! / 5))));
    }
  }
  return {
    cell,
    minX: grid.minX,
    minZ: grid.minZ,
    cols,
    rows,
    mask: Buffer.from(bits).toString('base64'),
    heights: Buffer.from(Int8Array.from(heights).buffer).toString('base64'),
  };
}
