import * as THREE from 'three';
import { PROP_STRIDE, type CityLayout } from '@drivemart/shared';
import { CAR } from '../vehicle/carModel';
import { PROP_BUILDERS, SMASHABLE, type SmashSpec } from './props';
import { geometryFromData } from './three';

const CELL = 16;
const VIEW_RADIUS = 230;
const RESET_RADIUS = 280;
const GRAVITY = 9.8;
const STATIC = 0,
  FLYING = 1,
  RESTING = 2;

const cellKey = (cx: number, cz: number) => (cx + 2048) * 4096 + (cz + 2048);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface CarState {
  position: THREE.Vector3;
  heading: number;
  velocity: { x: number; y: number; z: number };
}

/**
 * Props quebráveis: desenhados com instâncias (um draw call por tipo), com colisão simples contra o carro
 * e queda balística própria (sem corpos no Rapier, que ficam só para o carro e a cidade).
 */
export class SmashProps {
  readonly group = new THREE.Group();
  /** Chamado a cada batida, com a força (0 a 1). */
  onSmash: ((strength: number) => void) | null = null;

  private readonly n: number;
  private readonly type: Uint8Array;
  private readonly base: Float32Array;
  private readonly state: Uint8Array;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly ang: Float32Array;
  private readonly bounces: Uint8Array;
  private readonly quat: (THREE.Quaternion | null)[];
  private readonly grid = new Map<number, number[]>();
  private readonly specs: SmashSpec[] = [];
  private readonly meshes: THREE.InstancedMesh[] = [];
  /** Instância de cada prop visível (-1 quando fora do raio). */
  private readonly slot: Int32Array;
  private readonly active = new Set<number>();
  private center = new THREE.Vector3(Infinity, 0, Infinity);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly dq = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(layout: CityLayout, material: THREE.Material) {
    const typeIds: number[] = [];
    const typeNames: string[] = [];
    const picked: number[] = [];
    for (let i = 0; i < layout.props.length; i += PROP_STRIDE) {
      const name = layout.propTypes[layout.props[i]!]!;
      if (!SMASHABLE[name] || !PROP_BUILDERS[name]) continue;
      let t = typeNames.indexOf(name);
      if (t < 0) {
        t = typeNames.push(name) - 1;
        this.specs.push(SMASHABLE[name]);
      }
      typeIds.push(t);
      picked.push(i);
    }
    this.n = picked.length;
    this.type = Uint8Array.from(typeIds);
    this.base = new Float32Array(this.n * 4);
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.ang = new Float32Array(this.n * 3);
    this.state = new Uint8Array(this.n);
    this.bounces = new Uint8Array(this.n);
    this.slot = new Int32Array(this.n).fill(-1);
    this.quat = new Array<THREE.Quaternion | null>(this.n).fill(null);
    const perType = new Array<number>(typeNames.length).fill(0);
    picked.forEach((src, i) => {
      for (let k = 0; k < 4; k++) this.base[i * 4 + k] = layout.props[src + 1 + k]!;
      perType[this.type[i]!]!++;
      const key = cellKey(Math.floor(this.base[i * 4]! / CELL), Math.floor(this.base[i * 4 + 2]! / CELL));
      let list = this.grid.get(key);
      if (!list) this.grid.set(key, (list = []));
      list.push(i);
    });
    typeNames.forEach((name, t) => {
      const geo = geometryFromData(PROP_BUILDERS[name]!());
      const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, perType[t]!));
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
  }

  get count(): number {
    return this.n;
  }

  /** Situação de um prop (usado nos testes e na depuração). */
  stateOf(i: number): 'static' | 'flying' | 'resting' {
    return this.state[i] === FLYING ? 'flying' : this.state[i] === RESTING ? 'resting' : 'static';
  }

  /** Atualiza quedas, colisões com o carro e as instâncias visíveis. */
  update(car: CarState, dt: number): void {
    const p = car.position;
    if (Math.hypot(p.x - this.center.x, p.z - this.center.z) > 24) this.rebuild(p);
    this.collide(car);
    for (const i of this.active) this.simulate(i, dt);
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  private forNear(x: number, z: number, radius: number, fn: (i: number) => void): void {
    const c0x = Math.floor((x - radius) / CELL),
      c1x = Math.floor((x + radius) / CELL);
    const c0z = Math.floor((z - radius) / CELL),
      c1z = Math.floor((z + radius) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this.grid.get(cellKey(cx, cz));
        if (list) for (const i of list) fn(i);
      }
    }
  }

  /** Recalcula quais props estão perto o bastante para desenhar e devolve ao lugar os distantes. */
  private rebuild(p: THREE.Vector3): void {
    this.center.copy(p);
    this.slot.fill(-1);
    for (const mesh of this.meshes) mesh.count = 0;
    for (const i of this.active) {
      const dx = this.pos[i * 3]! - p.x,
        dz = this.pos[i * 3 + 2]! - p.z;
      if (dx * dx + dz * dz > RESET_RADIUS * RESET_RADIUS) this.restore(i);
    }
    const r2 = VIEW_RADIUS * VIEW_RADIUS;
    this.forNear(p.x, p.z, VIEW_RADIUS, (i) => {
      const dx = this.base[i * 4]! - p.x,
        dz = this.base[i * 4 + 2]! - p.z;
      if (dx * dx + dz * dz > r2 && this.state[i] === STATIC) return;
      const mesh = this.meshes[this.type[i]!]!;
      this.slot[i] = mesh.count++;
      this.writeMatrix(i);
    });
  }

  private restore(i: number): void {
    this.state[i] = STATIC;
    this.quat[i] = null;
    this.active.delete(i);
  }

  private writeMatrix(i: number): void {
    const s = this.slot[i]!;
    if (s < 0) return;
    if (this.state[i] === STATIC) {
      this.q.setFromAxisAngle(Y_AXIS, this.base[i * 4 + 3]!);
      this.v.set(this.base[i * 4]!, this.base[i * 4 + 1]!, this.base[i * 4 + 2]!);
      this.m.compose(this.v, this.q, this.one);
    } else {
      this.v.set(this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!);
      this.m.compose(this.v, this.quat[i]!, this.one);
    }
    this.meshes[this.type[i]!]!.setMatrixAt(s, this.m);
  }

  private collide(car: CarState): void {
    const p = car.position;
    const vx = car.velocity.x,
      vz = car.velocity.z;
    const speed = Math.hypot(vx, vz);
    if (speed < 1.5) return;
    const fx = Math.sin(car.heading),
      fz = Math.cos(car.heading);
    const halfW = CAR.width / 2,
      halfL = CAR.length / 2;
    const check = (i: number) => {
      const spec = this.specs[this.type[i]!]!;
      const resting = this.state[i] === RESTING;
      const x = resting ? this.pos[i * 3]! : this.base[i * 4]!;
      const y = resting ? this.pos[i * 3 + 1]! : this.base[i * 4 + 1]!;
      const z = resting ? this.pos[i * 3 + 2]! : this.base[i * 4 + 2]!;
      const dx = x - p.x,
        dz = z - p.z;
      if (Math.abs(y - p.y) > 2) return;
      const along = dx * fx + dz * fz;
      const side = dx * fz - dz * fx;
      if (Math.abs(along) > halfL + spec.r || Math.abs(side) > halfW + spec.r) return;
      this.launch(i, x, y, z, vx, vz, speed, dx, dz);
      this.onSmash?.(Math.min(1, speed / 25) * (0.5 + spec.mass * 0.5));
      // Freia o carro de leve, proporcional ao peso do objeto.
      car.velocity.x -= vx * 0.03 * spec.mass;
      car.velocity.z -= vz * 0.03 * spec.mass;
    };
    this.forNear(p.x, p.z, 5, (i) => {
      if (this.state[i] === STATIC) check(i);
    });
    // Objetos já derrubados podem ter ido parar longe da posição original.
    for (const i of this.active) if (this.state[i] === RESTING) check(i);
  }

  private launch(
    i: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vz: number,
    speed: number,
    dx: number,
    dz: number,
  ): void {
    const rnd = () => Math.random() * 2 - 1;
    const d = Math.hypot(dx, dz) || 1;
    // Empurrado no sentido do carro e para fora do para-choque.
    this.vel[i * 3] = vx * (1.05 + Math.random() * 0.3) + (dx / d) * 2 + rnd();
    this.vel[i * 3 + 1] = Math.min(9, 2.2 + speed * 0.2 + Math.random() * 1.5);
    this.vel[i * 3 + 2] = vz * (1.05 + Math.random() * 0.3) + (dz / d) * 2 + rnd();
    const spin = 3 + speed * 0.35;
    this.ang[i * 3] = rnd() * spin;
    this.ang[i * 3 + 1] = rnd() * spin;
    this.ang[i * 3 + 2] = rnd() * spin;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y + 0.05;
    this.pos[i * 3 + 2] = z;
    if (!this.quat[i]) this.quat[i] = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, this.base[i * 4 + 3]!);
    this.state[i] = FLYING;
    this.bounces[i] = 0;
    this.active.add(i);
    if (this.slot[i]! < 0) {
      const mesh = this.meshes[this.type[i]!]!;
      if (mesh.count < mesh.instanceMatrix.count) this.slot[i] = mesh.count++;
    }
  }

  private simulate(i: number, dt: number): void {
    if (this.state[i] !== FLYING) return;
    const floor = this.base[i * 4 + 1]!;
    const spec = this.specs[this.type[i]!]!;
    this.vel[i * 3 + 1]! -= GRAVITY * dt;
    for (let k = 0; k < 3; k++) this.pos[i * 3 + k]! += this.vel[i * 3 + k]! * dt;
    const q = this.quat[i]!;
    const ax = this.ang[i * 3]!,
      ay = this.ang[i * 3 + 1]!,
      az = this.ang[i * 3 + 2]!;
    const w = Math.hypot(ax, ay, az);
    if (w > 1e-4) {
      this.v.set(ax / w, ay / w, az / w);
      this.dq.setFromAxisAngle(this.v, w * dt);
      q.premultiply(this.dq);
    }
    if (this.pos[i * 3 + 1]! < floor && this.vel[i * 3 + 1]! < 0) {
      this.pos[i * 3 + 1] = floor;
      this.vel[i * 3 + 1] = -this.vel[i * 3 + 1]! * 0.35;
      this.vel[i * 3]! *= 0.6;
      this.vel[i * 3 + 2]! *= 0.6;
      for (let k = 0; k < 3; k++) this.ang[i * 3 + k]! *= 0.55;
      this.bounces[i]!++;
      const v = Math.hypot(this.vel[i * 3]!, this.vel[i * 3 + 1]!, this.vel[i * 3 + 2]!);
      if (this.bounces[i]! >= 3 || v < 1.2) {
        // Assenta deitado (ou em pé, no caso das caixas) com um rumo qualquer.
        const yaw = Math.random() * Math.PI * 2;
        q.setFromAxisAngle(Y_AXIS, yaw);
        if (spec.lie === 'side') q.multiply(this.dq.setFromAxisAngle(this.v.set(1, 0, 0), Math.PI / 2));
        this.pos[i * 3 + 1] = floor + spec.lift;
        this.state[i] = RESTING;
      }
    }
    this.writeMatrix(i);
  }
}
