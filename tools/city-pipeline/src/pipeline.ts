import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GROUND_MATERIAL_NAMES,
  LAYOUT_VERSION,
  latticeNodes,
  type CityLayout,
  type LayoutChunk,
  type LayoutLot,
  type RoadLattice,
} from '@drivemart/shared';
import { classifyModel, GROUND_MATERIALS, PROP_TYPES, TREE_TYPES, type ModelClass } from './classify';
import { worldSegments, type WorldSeg } from './facades';
import { buildGround } from './ground';
import { LotIds } from './ids';
import { buildLots, type Lot, type Wall } from './lots';
import { round2 } from './math';
import { collectProps } from './props';
import { buildRoadLattice } from './roads';
import { buildScene, type Scene } from './scene';
import { parseVrml } from './vrml/parser';
import { TriangleColors } from './world';
import type { Grid } from './raster';

export interface CityConfig {
  cityId: string;
  name: string;
  source: string;
  /** Pasta do nível dentro do arquivo .7z. */
  archiveFolder: string;
  unitsPerMeter: number;
  chunkSize: number;
  /** Ponto de partida fixo opcional [x, z]. */
  spawnNear?: [number, number];
}

export const CITIES: Record<string, CityConfig> = {
  rio: {
    cityId: 'rio',
    name: 'Rio de Janeiro',
    source: 'Traçado derivado de Driver 2 (Rio de Janeiro, v1.1). Sem texturas, malhas ou sons originais.',
    archiveFolder: 'Driver 2/LEVELS RIO 1.1',
    unitsPerMeter: 164,
    chunkSize: 128,
    // Avenida da orla, de frente para a praia.
    spawnNear: [150, -3163],
  },
};

export interface PipelineResult {
  layout: CityLayout;
  scene: Scene;
  grid: Grid;
  lots: Lot[];
  walls: Wall[];
  report: Record<string, number | string>;
}

function dedupeSegments(segs: WorldSeg[]): WorldSeg[] {
  const seen = new Set<string>();
  const out: WorldSeg[] = [];
  for (const s of segs) {
    const mx = (s.x0 + s.x1) / 2,
      mz = (s.z0 + s.z1) / 2;
    let ang = Math.atan2(s.z1 - s.z0, s.x1 - s.x0);
    if (ang < 0) ang += Math.PI;
    const key = `${s.inst}:${Math.round(mx / 0.7)}:${Math.round(mz / 0.7)}:${Math.round(ang / 0.1) % 31}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function pickSpawn(
  lattice: RoadLattice,
  lots: Lot[],
  near?: [number, number],
): [number, number, number, number] {
  const nodes = latticeNodes(lattice);
  const zoned = lots.filter((l) => l.zone);
  let best = 0,
    bestScore = -Infinity;
  for (let i = 0; i < nodes.x.length; i += near ? 1 : 5) {
    const x = nodes.x[i]!,
      z = nodes.z[i]!;
    if (Math.abs(nodes.y[i]!) > 0.5) continue;
    let score: number;
    if (near) score = -Math.hypot(x - near[0], z - near[1]);
    else {
      score = 0;
      for (const l of zoned) if (Math.hypot(l.zone!.x - x, l.zone!.z - z) < 120) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  const x = nodes.x[best]!,
    z = nodes.z[best]!;
  // Rumo: direção com a maior sequência de pista à frente.
  let heading = 0,
    longest = -1;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    let run = 0;
    for (let d = lattice.cell; d < 200; d += lattice.cell) {
      const c = Math.floor((x + Math.sin(a) * d - lattice.minX) / lattice.cell);
      const r = Math.floor((z + Math.cos(a) * d - lattice.minZ) / lattice.cell);
      if (!nodes.at(c, r)) break;
      run++;
    }
    if (run > longest) {
      longest = run;
      heading = a;
    }
  }
  return [round2(x), round2(nodes.y[best]! + 0.1), round2(z), round2(heading)];
}

export function runPipeline(levelDir: string, cfg: CityConfig, idsPath: string): PipelineResult {
  const t0 = Date.now();
  const doc = parseVrml(readFileSync(join(levelDir, 'level.wrl'), 'latin1'));
  const scene = buildScene(doc, { unitsPerMeter: cfg.unitsPerMeter });
  const classes = new Map<string, ModelClass>();
  for (const m of scene.models.values()) classes.set(m.name, classifyModel(m));

  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  for (const i of scene.instances) {
    minX = Math.min(minX, i.x);
    maxX = Math.max(maxX, i.x);
    minZ = Math.min(minZ, i.z);
    maxZ = Math.max(maxZ, i.z);
  }
  const bounds: [number, number, number, number] = [
    Math.floor(minX - 60),
    Math.floor(minZ - 60),
    Math.ceil(maxX + 60),
    Math.ceil(maxZ + 60),
  ];

  const colors = new TriangleColors(levelDir);
  const ground = buildGround(scene, classes, colors, cfg.chunkSize, bounds);

  const buildingSegs = worldSegments(scene, (m) => classes.get(m)?.kind === 'building', colors, {
    minLength: 3,
    minHeight: 2.5,
    maxHeight: 60,
  });
  const { lots, walls } = buildLots(dedupeSegments(buildingSegs), ground.grid, bounds);

  const lowSegs = dedupeSegments(
    worldSegments(scene, (m) => classes.get(m)?.kind === 'wall', colors, {
      minLength: 0.8,
      minHeight: 0.3,
      maxHeight: 3.2,
    }),
  );
  const { props, trees } = collectProps(scene, classes);

  const roads = buildRoadLattice(ground.grid, 5);
  const ids = new LotIds(cfg.cityId, idsPath);
  for (const l of lots) l.id = ids.assign((l.facade[0] + l.facade[2]) / 2, (l.facade[1] + l.facade[3]) / 2);
  ids.save();
  lots.sort((a, b) => (a.id < b.id ? -1 : 1));

  const chunks: Record<string, LayoutChunk> = {};
  for (const [key, ch] of [...ground.chunks.entries()].sort()) {
    const g = ch.polys.map((p) => ({
      m: GROUND_MATERIALS.indexOf(p.mat),
      y: round2(p.y),
      r: p.rings.map((r) => r.map(round2)),
    }));
    const c: LayoutChunk = { g };
    if (ch.slopes.length) c.s = ch.slopes.flatMap((s) => [GROUND_MATERIALS.indexOf(s.mat), ...s.p]);
    if (g.length || c.s) chunks[key] = c;
  }

  const layoutLots: LayoutLot[] = lots.map((l) => ({
    id: l.id,
    p: l.poly.map(round2),
    f: l.facade.map(round2) as LayoutLot['f'],
    n: [round2(l.normal[0]), round2(l.normal[1])],
    y: round2(l.y),
    h: round2(l.height),
    fl: l.floors,
    a: Math.round(l.area),
    c: l.tint,
    z: l.zone
      ? [
          round2(l.zone.x),
          round2(l.zone.z),
          round2(l.zone.y),
          round2(l.zone.angle),
          round2(l.zone.w),
          round2(l.zone.d),
        ]
      : null,
    o: l.orla ? 1 : 0,
    s: l.sector,
    pr: l.price,
  }));

  const layout: CityLayout = {
    version: LAYOUT_VERSION,
    cityId: cfg.cityId,
    name: cfg.name,
    source: cfg.source,
    chunkSize: cfg.chunkSize,
    bounds,
    spawn: pickSpawn(roads, lots, cfg.spawnNear),
    materials: [...GROUND_MATERIAL_NAMES],
    propTypes: [...PROP_TYPES],
    treeTypes: [...TREE_TYPES],
    chunks,
    lots: layoutLots,
    walls: walls.flatMap((w) => [
      round2(w.x0),
      round2(w.z0),
      round2(w.x1),
      round2(w.z1),
      round2(w.y),
      round2(w.h),
      ...w.tint,
    ]),
    lowWalls: lowSegs.flatMap((s) => [
      round2(s.x0),
      round2(s.z0),
      round2(s.x1),
      round2(s.z1),
      round2(s.y0),
      round2(s.y1 - s.y0),
    ]),
    props,
    trees,
    roads,
  };

  const kinds: Record<string, number> = {};
  for (const c of classes.values()) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
  const report: Record<string, number | string> = {
    modelos: scene.models.size,
    instancias: scene.instances.length,
    ...Object.fromEntries(Object.entries(kinds).map(([k, v]) => [`modelos_${k}`, v])),
    chunks: Object.keys(chunks).length,
    poligonos_chao: Object.values(chunks).reduce((a, c) => a + c.g.length, 0),
    segmentos_fachada: buildingSegs.length,
    lotes: lots.length,
    lotes_compraveis: lots.filter((l) => l.zone).length,
    paredes_sem_lote: walls.length,
    muretas: lowSegs.length,
    props: props.length / 5,
    arvores: trees.length / 5,
    celulas_pista: latticeNodes(roads).x.length,
    tempo_ms: Date.now() - t0,
  };
  return { layout, scene, grid: ground.grid, lots, walls, report };
}
