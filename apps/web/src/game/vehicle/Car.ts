import type RAPIER from '@dimforge/rapier3d-compat';
import type { CarSpec } from '@drivemart/shared';
import * as THREE from 'three';
import type { DriveInput } from '../input/Input';
import type { Physics } from '../physics/Physics';
import { meshFromData } from '../world/three';
import { buildCarBody, buildWheel, carProfile, extremeAxles, maxHalfWidth, wheelWidth } from './carModel';

/** Ajustes de dirigibilidade (estilo arcade do Driver), para um sedã de 4,6 x 1,84 m. */
export const HANDLING = {
  mass: 1150,
  ballast: 450,
  engineForce: 3300,
  reverseForce: 1800,
  maxSpeed: 53, // ~190 km/h
  maxReverse: 9,
  brake: 28,
  handbrake: 60,
  drag: 1.3,
  downforce: 0.9,
  steerLow: 0.62,
  steerHigh: 0.14,
  steerRate: 4.5,
  gripFront: 2.4,
  gripRear: 2.2,
  gripRearHandbrake: 0.65,
  suspensionRest: 0.32,
  suspensionStiffness: 32,
  suspensionCompression: 3.2,
  suspensionRelaxation: 3.8,
};

export type Handling = typeof HANDLING;

const BASE_AREA = 4.6 * 1.84;

/** Dirigibilidade de cada tipo: massa pelo tamanho, força e freios na mesma proporção, máxima do catálogo. */
export function handlingFor(spec: CarSpec): Handling {
  const heavy = spec.kind === 'bus' || spec.kind === 'truck' || spec.kind === 'fire';
  const k = Math.min(4, Math.max(0.75, (spec.length * spec.width) / BASE_AREA)) * (heavy ? 1.15 : 1);
  return {
    ...HANDLING,
    mass: HANDLING.mass * k,
    ballast: HANDLING.ballast * k,
    engineForce: HANDLING.engineForce * k * (heavy ? 0.72 : 1),
    reverseForce: HANDLING.reverseForce * k,
    maxSpeed: spec.maxKmh / 3.6,
    brake: HANDLING.brake * k,
    handbrake: HANDLING.handbrake * k,
    drag: HANDLING.drag * k,
    downforce: HANDLING.downforce * k,
    gripFront: HANDLING.gripFront * (heavy ? 0.92 : 1),
    gripRear: HANDLING.gripRear * (heavy ? 0.92 : 1),
  };
}

/** Compressão da suspensão com o carro parado (a força da mola no Rapier é proporcional à massa). */
const SAG = 9.81 / (4 * HANDLING.suspensionStiffness);

export class Car {
  readonly body: RAPIER.RigidBody;
  readonly vehicle: RAPIER.DynamicRayCastVehicleController;
  readonly object = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private steer = 0;
  private upsideDownTime = 0;
  /** Velocidade escalar ao longo da frente do carro (m/s). */
  speed = 0;
  /** Velocidade lateral (m/s): derrapagem. */
  lateral = 0;
  /** Maior desaceleração brusca desde a última leitura (m/s por passo), para o som de batida. */
  private impact = 0;
  private lastVel: { x: number; z: number } | null = null;
  readonly prevPos = new THREE.Vector3();
  readonly prevQuat = new THREE.Quaternion();

  readonly spec: CarSpec;
  readonly color: number;
  /** Altura do centro do chassi em relação ao chão quando parado. */
  readonly rideHeight: number;
  private readonly h: Handling;

  constructor(
    private readonly physics: Physics,
    material: THREE.Material,
    spec: CarSpec,
    color: number,
    spawn: [number, number, number, number],
  ) {
    this.spec = spec;
    this.color = Math.max(0, Math.min(spec.colors.length - 1, color));
    const h = (this.h = handlingFor(spec));
    const r = spec.wheels.radius;
    const ride = (this.rideHeight = Math.max(0.62, r + 0.28));
    const halfW = maxHalfWidth(spec);
    const halfL = spec.length / 2;
    const R = physics.R;
    const world = physics.world;
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(spawn[0], spawn[1] + ride + 0.3, spawn[2])
        .setRotation({ x: 0, y: Math.sin(spawn[3] / 2), z: 0, w: Math.cos(spawn[3] / 2) })
        .setLinearDamping(0.05)
        .setAngularDamping(0.6)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    // Chassi + lastro baixo (centro de massa mais baixo, menos capotagem).
    const chassisTop = ride + 0.44;
    world.createCollider(
      R.ColliderDesc.cuboid(halfW - 0.02, 0.32, halfL - 0.05)
        .setTranslation(0, 0.12, 0)
        .setMass(h.mass)
        .setFriction(0.4)
        .setRestitution(0.15),
      this.body,
    );
    world.createCollider(
      R.ColliderDesc.cuboid(Math.min(0.5, halfW * 0.6), 0.05, Math.min(halfL * 0.55, 3))
        .setTranslation(0, -0.18, 0.1)
        .setMass(h.ballast),
      this.body,
    );
    // Parte alta (cabine, baú, ônibus) sem massa, só para bater.
    const prof = carProfile(spec);
    const cab = prof.cabin;
    if (cab && spec.height - chassisTop > 0.15) {
      const hy = (spec.height - chassisTop) / 2;
      const zc = (cab.z0 + cab.z1) / 2;
      const hz = Math.max(0.3, (cab.z1 - cab.z0) / 2);
      const rhw = Math.max(...prof.slices.map((s) => s.roofHalfWidth));
      world.createCollider(
        R.ColliderDesc.cuboid(rhw - 0.02, hy, hz)
          .setTranslation(0, chassisTop - ride + hy, zc)
          .setDensity(0)
          .setFriction(0.4)
          .setRestitution(0.15),
        this.body,
      );
    }

    this.vehicle = world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;
    // Ponto de fixação tal que, parado, a roda encosta no chão com o chassi na altura `ride`.
    const wheelY = -(ride - r) + h.suspensionRest - SAG;
    const [zf, zr] = extremeAxles(spec);
    const tx = spec.wheels.track;
    const positions: [number, number][] = [
      [tx, zf],
      [-tx, zf],
      [tx, zr],
      [-tx, zr],
    ];
    positions.forEach(([x, z], i) => {
      this.vehicle.addWheel(
        { x, y: wheelY, z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        h.suspensionRest,
        r,
      );
      this.vehicle.setWheelSuspensionStiffness(i, h.suspensionStiffness);
      this.vehicle.setWheelSuspensionCompression(i, h.suspensionCompression);
      this.vehicle.setWheelSuspensionRelaxation(i, h.suspensionRelaxation);
      this.vehicle.setWheelMaxSuspensionForce(i, 60000 * (h.mass / HANDLING.mass));
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.3);
      this.vehicle.setWheelFrictionSlip(i, i < 2 ? h.gripFront : h.gripRear);
      this.vehicle.setWheelSideFrictionStiffness(i, 1);
    });

    // Visual: carroceria com origem no chão; o grupo segue o chassi deslocado para baixo.
    const bodyMesh = meshFromData(buildCarBody(spec, spec.colors[this.color]!), material);
    bodyMesh.position.y = -ride;
    this.object.add(bodyMesh);
    const wheelData = buildWheel(r, wheelWidth(spec));
    // Rodas visuais: as quatro da física primeiro (seguem a suspensão), depois os eixos do meio, se houver.
    const visual: [number, number][] = [
      ...positions,
      ...spec.wheels.axles
        .filter((a) => a !== zf && a !== zr)
        .flatMap((a): [number, number][] => [
          [tx, a],
          [-tx, a],
        ]),
    ];
    for (const [x, z] of visual) {
      const pivot = new THREE.Object3D();
      pivot.position.set(x, -ride + r, z);
      const w = meshFromData(wheelData, material);
      w.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      const spin = new THREE.Object3D();
      spin.add(w);
      pivot.add(spin);
      this.object.add(pivot);
      this.wheels.push(pivot);
    }
    this.object.add(createShadow(halfW * 2, spec.length, ride));
    this.savePrevious();
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  /** Rumo em radianos (frente = (sen h, cos h) no plano XZ). */
  get heading(): number {
    const q = this.body.rotation();
    const fx = 2 * (q.x * q.z + q.w * q.y);
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    return Math.atan2(fx, fz);
  }

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  savePrevious(): void {
    const t = this.body.translation();
    const q = this.body.rotation();
    this.prevPos.set(t.x, t.y, t.z);
    this.prevQuat.set(q.x, q.y, q.z, q.w);
  }

  /** Aplica comandos antes do passo de física. */
  control(input: DriveInput, dt: number): void {
    const v = this.vehicle;
    const speed = v.currentVehicleSpeed();
    this.speed = speed;
    const abs = Math.abs(speed);

    const steerMax = this.h.steerLow + (this.h.steerHigh - this.h.steerLow) * Math.min(1, abs / 40);
    const target = input.steer * steerMax;
    this.steer += Math.max(-this.h.steerRate * dt, Math.min(this.h.steerRate * dt, target - this.steer));
    v.setWheelSteering(0, this.steer);
    v.setWheelSteering(1, this.steer);

    let engine = 0;
    let brake = 0;
    if (input.throttle > 0) {
      if (speed < -0.5) brake = this.h.brake * input.throttle;
      else if (speed < this.h.maxSpeed)
        engine = this.h.engineForce * input.throttle * (1 - (speed / this.h.maxSpeed) ** 3 * 0.6);
    }
    if (input.brake > 0) {
      if (speed > 0.8) brake = Math.max(brake, this.h.brake * input.brake);
      else if (speed > -this.h.maxReverse) engine = -this.h.reverseForce * input.brake;
    }
    if (!input.throttle && !input.brake && abs < 0.6) brake = 4;
    for (const i of [2, 3]) v.setWheelEngineForce(i, engine);
    for (let i = 0; i < 4; i++) v.setWheelBrake(i, brake);
    const rearGrip = input.handbrake ? this.h.gripRearHandbrake : this.h.gripRear;
    v.setWheelFrictionSlip(2, rearGrip);
    v.setWheelFrictionSlip(3, rearGrip);
    if (input.handbrake) {
      v.setWheelBrake(2, this.h.handbrake);
      v.setWheelBrake(3, this.h.handbrake);
    }

    // Arrasto e pressão aerodinâmica.
    const lv = this.body.linvel();
    const q0 = this.body.rotation();
    this.lateral = lv.x * (1 - 2 * (q0.y * q0.y + q0.z * q0.z)) + lv.z * 2 * (q0.x * q0.z - q0.w * q0.y);
    if (this.lastVel) {
      // Variação acima do que motor e freio conseguem num passo indica batida.
      const dv = Math.hypot(lv.x - this.lastVel.x, lv.z - this.lastVel.z);
      if (dv > 0.6) this.impact = Math.max(this.impact, dv);
    }
    this.lastVel = { x: lv.x, z: lv.z };
    const vel2 = lv.x * lv.x + lv.z * lv.z;
    const vel = Math.sqrt(vel2);
    this.body.resetForces(true);
    if (vel > 0.1) {
      const k = this.h.drag * vel;
      this.body.addForce({ x: -lv.x * k, y: -this.h.downforce * vel2 * 4, z: -lv.z * k }, true);
    }

    v.updateVehicle(dt);

    // Desvirar automático, como no Driver.
    const q = this.body.rotation();
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (upY < 0.3 && abs < 3) this.upsideDownTime += dt;
    else this.upsideDownTime = 0;
    if (this.upsideDownTime > 1.6) {
      const p = this.body.translation();
      this.place(p.x, p.y + 1.2, p.z, this.heading);
    }
  }

  /** Devolve e zera a batida mais forte registrada (m/s perdidos num passo). */
  takeImpact(): number {
    const v = this.impact;
    this.impact = 0;
    return v;
  }

  /** Copia a pose da física para o visual, interpolando entre passos. */
  sync(alpha: number): void {
    const t = this.body.translation();
    const q = this.body.rotation();
    this.object.position.lerpVectors(this.prevPos, new THREE.Vector3(t.x, t.y, t.z), alpha);
    this.object.quaternion.slerpQuaternions(this.prevQuat, new THREE.Quaternion(q.x, q.y, q.z, q.w), alpha);
    const v = this.vehicle;
    this.wheels.forEach((pivot, k) => {
      // Rodas dos eixos do meio copiam a roda traseira do mesmo lado.
      const i = k < 4 ? k : 2 + (k % 2);
      const len = v.wheelSuspensionLength(i) ?? HANDLING.suspensionRest;
      const conn = v.wheelChassisConnectionPointCs(i);
      if (conn) pivot.position.y = conn.y - len;
      pivot.rotation.y = k < 2 ? (v.wheelSteering(i) ?? 0) : 0;
      const spin = pivot.children[0]!;
      spin.rotation.x = v.wheelRotation(i) ?? 0;
    });
  }

  /** Coloca o carro parado numa posição e rumo. */
  place(x: number, y: number, z: number, heading: number): void {
    this.body.setTranslation({ x, y: y + this.rideHeight + 0.2, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.upsideDownTime = 0;
    this.lastVel = null;
    this.impact = 0;
    this.savePrevious();
  }

  dispose(): void {
    this.physics.world.removeVehicleController(this.vehicle);
    this.physics.world.removeRigidBody(this.body);
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.object.removeFromParent();
  }
}

/** Sombra simples (disco escuro), como nos jogos de PS1. */
function createShadow(width: number, length: number, ride: number): THREE.Mesh {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.5, length * 1.25),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -ride + 0.04;
  mesh.renderOrder = 1;
  return mesh;
}
