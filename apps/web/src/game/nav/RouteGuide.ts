import * as THREE from 'three';
import type { LayoutLot } from '@drivemart/shared';
import type { RoadGraph } from './RoadGraph';

const MAX_ARROWS = 400;
const SPACING = 7;

export interface RouteState {
  lotId: string;
  /** Distância restante (m). */
  distance: number;
}

function arrowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(60, 40);
  ctx.lineTo(42, 40);
  ctx.lineTo(42, 60);
  ctx.lineTo(22, 60);
  ctx.lineTo(22, 40);
  ctx.lineTo(4, 40);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Rota de GPS até a zona de um lote: setas no chão, seta sobre o carro e aviso de chegada. */
export class RouteGuide {
  readonly group = new THREE.Group();
  private arrows: THREE.InstancedMesh;
  private pointer: THREE.Mesh;
  private points: THREE.Vector3[] = [];
  private target: LayoutLot | null = null;
  private recheck = 0;
  private dummy = new THREE.Object3D();
  onArrive: (() => void) | null = null;

  constructor(private readonly roads: RoadGraph) {
    const geo = new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: arrowTexture(),
      color: '#ff3df2',
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.arrows = new THREE.InstancedMesh(geo, mat, MAX_ARROWS);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    this.arrows.renderOrder = 2;
    const cone = new THREE.ConeGeometry(0.28, 0.9, 4).rotateX(Math.PI / 2);
    this.pointer = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: '#ff3df2', depthTest: false }));
    this.pointer.renderOrder = 10;
    this.pointer.visible = false;
    this.group.add(this.arrows, this.pointer);
  }

  get active(): boolean {
    return !!this.target;
  }

  get targetId(): string | null {
    return this.target?.id ?? null;
  }

  /** Traça a rota do ponto atual até a zona do lote. Retorna falso se não houver caminho. */
  set(lot: LayoutLot | null, from: THREE.Vector3): boolean {
    this.target = lot;
    this.points = [];
    if (!lot?.z) {
      this.target = null;
      this.render();
      return false;
    }
    const a = this.roads.nearest(from.x, from.z, 800, true);
    const b = this.roads.nearest(lot.z[0], lot.z[1], 800, true);
    const path = this.roads.route(a, b);
    if (!path.length) {
      this.target = null;
      this.render();
      return false;
    }
    this.points = path.map((n) => new THREE.Vector3(this.roads.x(n), this.roads.y(n), this.roads.z(n)));
    this.points.push(new THREE.Vector3(lot.z[0], lot.z[2], lot.z[1]));
    this.render();
    return true;
  }

  clear(): void {
    this.target = null;
    this.points = [];
    this.render();
  }

  private render(): void {
    let k = 0;
    let carry = 0;
    for (let i = 0; i + 1 < this.points.length && k < MAX_ARROWS; i++) {
      const p = this.points[i]!,
        q = this.points[i + 1]!;
      const seg = Math.hypot(q.x - p.x, q.z - p.z);
      if (seg < 0.01) continue;
      const yaw = Math.atan2(q.x - p.x, q.z - p.z);
      for (let d = SPACING - carry; d < seg && k < MAX_ARROWS; d += SPACING) {
        const t = d / seg;
        this.dummy.position.set(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t + 0.06, p.z + (q.z - p.z) * t);
        this.dummy.rotation.set(0, yaw + Math.PI, 0);
        this.dummy.updateMatrix();
        this.arrows.setMatrixAt(k++, this.dummy.matrix);
      }
      carry = (seg + carry) % SPACING;
    }
    this.arrows.count = k;
    this.arrows.instanceMatrix.needsUpdate = true;
    this.pointer.visible = this.points.length > 0;
  }

  /** Índice do ponto da rota mais próximo do carro e a distância até ele. */
  private nearestIndex(pos: THREE.Vector3): { i: number; d: number } {
    let best = 0,
      bestD = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const d = Math.hypot(this.points[i]!.x - pos.x, this.points[i]!.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { i: best, d: bestD };
  }

  update(pos: THREE.Vector3, dt: number): RouteState | null {
    if (!this.target?.z || !this.points.length) return null;
    const dz = Math.hypot(this.target.z[0] - pos.x, this.target.z[1] - pos.z);
    if (dz < 12) {
      const done = this.onArrive;
      this.clear();
      done?.();
      return null;
    }
    const { i, d } = this.nearestIndex(pos);
    this.recheck += dt;
    if (d > 40 && this.recheck > 2) {
      this.recheck = 0;
      this.set(this.target, pos);
      return this.update(pos, 0);
    }
    // Seta sobre o carro aponta para um ponto ~20 m adiante na rota.
    let ahead = i,
      acc = 0;
    while (ahead + 1 < this.points.length && acc < 20) {
      acc += this.points[ahead]!.distanceTo(this.points[ahead + 1]!);
      ahead++;
    }
    const aim = this.points[ahead]!;
    this.pointer.position.set(pos.x, pos.y + 2.6, pos.z);
    this.pointer.lookAt(aim.x, pos.y + 2.6, aim.z);
    let remaining = d;
    for (let k = i; k + 1 < this.points.length; k++)
      remaining += this.points[k]!.distanceTo(this.points[k + 1]!);
    return { lotId: this.target.id, distance: remaining };
  }
}
