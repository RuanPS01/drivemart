import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { DriveInput } from '../input/Input';
import type { Physics } from '../physics/Physics';
import type { Vec3 } from '../world/meshBuilder';
import { meshFromData } from '../world/three';
import { buildCarBody, buildWheel, CAR } from './carModel';

/** Ajustes de dirigibilidade (estilo arcade do Driver). */
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

/** Altura do centro do chassi em relação ao chão quando parado. */
const RIDE_HEIGHT = 0.62;

export class Car {
  readonly body: RAPIER.RigidBody;
  readonly vehicle: RAPIER.DynamicRayCastVehicleController;
  readonly object = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private steer = 0;
  private upsideDownTime = 0;
  /** Velocidade escalar ao longo da frente do carro (m/s). */
  speed = 0;
  readonly prevPos = new THREE.Vector3();
  readonly prevQuat = new THREE.Quaternion();

  constructor(
    private readonly physics: Physics,
    material: THREE.Material,
    paint: Vec3,
    spawn: [number, number, number, number],
  ) {
    const R = physics.R;
    const world = physics.world;
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(spawn[0], spawn[1] + RIDE_HEIGHT + 0.3, spawn[2])
        .setRotation({ x: 0, y: Math.sin(spawn[3] / 2), z: 0, w: Math.cos(spawn[3] / 2) })
        .setLinearDamping(0.05)
        .setAngularDamping(0.6)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    // Chassi + lastro baixo (centro de massa mais baixo, menos capotagem).
    world.createCollider(
      R.ColliderDesc.cuboid(CAR.width / 2 - 0.02, 0.32, CAR.length / 2 - 0.05)
        .setTranslation(0, 0.12, 0)
        .setMass(HANDLING.mass)
        .setFriction(0.4)
        .setRestitution(0.15),
      this.body,
    );
    world.createCollider(
      R.ColliderDesc.cuboid(0.5, 0.05, 1.2).setTranslation(0, -0.18, 0.1).setMass(HANDLING.ballast),
      this.body,
    );

    this.vehicle = world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;
    const wheelY = -(RIDE_HEIGHT - CAR.wheelRadius) + HANDLING.suspensionRest * 0.6;
    const positions: [number, number][] = [
      [CAR.wheelX, CAR.wheelFrontZ],
      [-CAR.wheelX, CAR.wheelFrontZ],
      [CAR.wheelX, CAR.wheelRearZ],
      [-CAR.wheelX, CAR.wheelRearZ],
    ];
    positions.forEach(([x, z], i) => {
      this.vehicle.addWheel(
        { x, y: wheelY, z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        HANDLING.suspensionRest,
        CAR.wheelRadius,
      );
      this.vehicle.setWheelSuspensionStiffness(i, HANDLING.suspensionStiffness);
      this.vehicle.setWheelSuspensionCompression(i, HANDLING.suspensionCompression);
      this.vehicle.setWheelSuspensionRelaxation(i, HANDLING.suspensionRelaxation);
      this.vehicle.setWheelMaxSuspensionForce(i, 60000);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.3);
      this.vehicle.setWheelFrictionSlip(i, i < 2 ? HANDLING.gripFront : HANDLING.gripRear);
      this.vehicle.setWheelSideFrictionStiffness(i, 1);
    });

    // Visual: carroceria com origem no chão; o grupo segue o chassi deslocado para baixo.
    const bodyMesh = meshFromData(buildCarBody(paint), material);
    bodyMesh.position.y = -RIDE_HEIGHT;
    this.object.add(bodyMesh);
    const wheelData = buildWheel();
    for (const [x, z] of positions) {
      const pivot = new THREE.Object3D();
      pivot.position.set(x, -RIDE_HEIGHT + CAR.wheelRadius, z);
      const w = meshFromData(wheelData, material);
      w.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      const spin = new THREE.Object3D();
      spin.add(w);
      pivot.add(spin);
      this.object.add(pivot);
      this.wheels.push(pivot);
    }
    this.object.add(createShadow());
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

    const steerMax = HANDLING.steerLow + (HANDLING.steerHigh - HANDLING.steerLow) * Math.min(1, abs / 40);
    const target = input.steer * steerMax;
    this.steer += Math.max(-HANDLING.steerRate * dt, Math.min(HANDLING.steerRate * dt, target - this.steer));
    v.setWheelSteering(0, this.steer);
    v.setWheelSteering(1, this.steer);

    let engine = 0;
    let brake = 0;
    if (input.throttle > 0) {
      if (speed < -0.5) brake = HANDLING.brake * input.throttle;
      else if (speed < HANDLING.maxSpeed)
        engine = HANDLING.engineForce * input.throttle * (1 - (speed / HANDLING.maxSpeed) ** 3 * 0.6);
    }
    if (input.brake > 0) {
      if (speed > 0.8) brake = Math.max(brake, HANDLING.brake * input.brake);
      else if (speed > -HANDLING.maxReverse) engine = -HANDLING.reverseForce * input.brake;
    }
    if (!input.throttle && !input.brake && abs < 0.6) brake = 4;
    for (const i of [2, 3]) v.setWheelEngineForce(i, engine);
    for (let i = 0; i < 4; i++) v.setWheelBrake(i, brake);
    const rearGrip = input.handbrake ? HANDLING.gripRearHandbrake : HANDLING.gripRear;
    v.setWheelFrictionSlip(2, rearGrip);
    v.setWheelFrictionSlip(3, rearGrip);
    if (input.handbrake) {
      v.setWheelBrake(2, HANDLING.handbrake);
      v.setWheelBrake(3, HANDLING.handbrake);
    }

    // Arrasto e pressão aerodinâmica.
    const lv = this.body.linvel();
    const vel2 = lv.x * lv.x + lv.z * lv.z;
    const vel = Math.sqrt(vel2);
    this.body.resetForces(true);
    if (vel > 0.1) {
      const k = HANDLING.drag * vel;
      this.body.addForce({ x: -lv.x * k, y: -HANDLING.downforce * vel2 * 4, z: -lv.z * k }, true);
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

  /** Copia a pose da física para o visual, interpolando entre passos. */
  sync(alpha: number): void {
    const t = this.body.translation();
    const q = this.body.rotation();
    this.object.position.lerpVectors(this.prevPos, new THREE.Vector3(t.x, t.y, t.z), alpha);
    this.object.quaternion.slerpQuaternions(this.prevQuat, new THREE.Quaternion(q.x, q.y, q.z, q.w), alpha);
    const v = this.vehicle;
    this.wheels.forEach((pivot, i) => {
      const len = v.wheelSuspensionLength(i) ?? HANDLING.suspensionRest;
      const conn = v.wheelChassisConnectionPointCs(i);
      if (conn) pivot.position.y = conn.y - len;
      pivot.rotation.y = v.wheelSteering(i) ?? 0;
      const spin = pivot.children[0]!;
      spin.rotation.x = v.wheelRotation(i) ?? 0;
    });
  }

  /** Coloca o carro parado numa posição e rumo. */
  place(x: number, y: number, z: number, heading: number): void {
    this.body.setTranslation({ x, y: y + RIDE_HEIGHT + 0.2, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.upsideDownTime = 0;
    this.savePrevious();
  }

  dispose(): void {
    this.physics.world.removeVehicleController(this.vehicle);
    this.physics.world.removeRigidBody(this.body);
  }
}

/** Sombra simples (disco escuro), como nos jogos de PS1. */
function createShadow(): THREE.Mesh {
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
    new THREE.PlaneGeometry(CAR.width * 1.5, CAR.length * 1.25),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -RIDE_HEIGHT + 0.04;
  mesh.renderOrder = 1;
  return mesh;
}
