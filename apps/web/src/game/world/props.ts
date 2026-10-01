import { LAYER } from '../art/TextureLibrary';
import { MeshBuilder, type MeshData, type Vec3 } from './meshBuilder';

const WHITE: Vec3 = [1, 1, 1];
const GRAY: Vec3 = [0.85, 0.85, 0.85];

/** Modelos low-poly próprios dos props, em coordenadas locais (base no chão, frente em +X). */
export const PROP_BUILDERS: Record<string, () => MeshData> = {
  streetlight: () => {
    const b = new MeshBuilder();
    b.cylinder(0, 0, 0, 0.14, 0.09, 8.8, 6, LAYER.metal, WHITE);
    b.box(1.2, 8.75, 0, 1.25, 0.06, 0.06, 0, LAYER.metal, WHITE);
    b.box(2.3, 8.6, 0, 0.35, 0.1, 0.18, 0, LAYER.metal, WHITE, 1, LAYER.metal);
    b.box(2.3, 8.47, 0, 0.3, 0.03, 0.14, 0, LAYER.lamp, WHITE);
    return b.build();
  },
  trafficlight: () => {
    const b = new MeshBuilder();
    b.cylinder(0, 0, 0, 0.12, 0.1, 5.6, 6, LAYER.metal, GRAY);
    b.box(2.2, 5.5, 0, 2.2, 0.06, 0.06, 0, LAYER.metal, GRAY);
    b.box(3.6, 4.9, 0, 0.18, 0.5, 0.18, 0, LAYER.trafficLight, WHITE);
    b.box(0.25, 2.6, 0, 0.16, 0.45, 0.16, 0, LAYER.trafficLight, WHITE);
    return b.build();
  },
  mastlight: () => {
    const b = new MeshBuilder();
    b.cylinder(0, 0, 0, 0.3, 0.15, 16.5, 6, LAYER.metal, GRAY);
    b.box(0, 16.7, 0, 1.2, 0.35, 0.4, 0, LAYER.metal, GRAY, 1, LAYER.lamp);
    return b.build();
  },
  cone: () => {
    const b = new MeshBuilder();
    b.box(0, 0.02, 0, 0.2, 0.02, 0.2, 0, LAYER.cone, WHITE);
    b.cylinder(0, 0.04, 0, 0.15, 0.02, 0.48, 6, LAYER.cone, WHITE);
    return b.build();
  },
  box: () => {
    const b = new MeshBuilder();
    b.box(0, 0.3, 0, 0.3, 0.3, 0.3, 0, LAYER.wood, WHITE, 0.6);
    return b.build();
  },
  barrel: () => {
    const b = new MeshBuilder();
    b.cylinder(0, 0, 0, 0.3, 0.3, 0.9, 8, LAYER.barrier, WHITE, LAYER.metal);
    return b.build();
  },
  bin: () => {
    const b = new MeshBuilder();
    b.cylinder(0, 0, 0, 0.24, 0.27, 0.8, 8, LAYER.plastic, WHITE, LAYER.plastic);
    return b.build();
  },
  chair: () => {
    const b = new MeshBuilder();
    b.box(0, 0.45, 0, 0.22, 0.03, 0.22, 0, LAYER.plastic, WHITE);
    b.box(-0.2, 0.75, 0, 0.02, 0.28, 0.22, 0, LAYER.plastic, WHITE);
    b.box(0, 0.21, 0, 0.18, 0.21, 0.18, 0, LAYER.plastic, [0.6, 0.6, 0.6]);
    return b.build();
  },
  table: () => {
    const b = new MeshBuilder();
    b.box(0, 0.72, 0, 0.45, 0.03, 0.45, 0, LAYER.wood, WHITE);
    b.cylinder(0, 0, 0, 0.05, 0.05, 0.7, 5, LAYER.metal, WHITE);
    return b.build();
  },
  umbrella: () => {
    const b = new MeshBuilder();
    b.cylinder(0, 0, 0, 0.03, 0.03, 2.3, 4, LAYER.metal, WHITE);
    b.cylinder(0, 1.95, 0, 1.3, 0.05, 0.45, 8, LAYER.canvas, WHITE);
    return b.build();
  },
  barrier: () => {
    const b = new MeshBuilder();
    b.box(0, 0.5, 0, 0.12, 0.5, 0.9, 0, LAYER.barrier, WHITE, 1, LAYER.barrier);
    return b.build();
  },
};

/** Props com colisão (postes). Valor = meia-largura do colisor. */
export const POLE_PROPS: Record<string, { r: number; h: number }> = {
  streetlight: { r: 0.18, h: 8.8 },
  trafficlight: { r: 0.18, h: 5.6 },
  mastlight: { r: 0.35, h: 16.5 },
};
