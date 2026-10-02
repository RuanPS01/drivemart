import * as THREE from 'three';

export type CameraMode = 'chase' | 'bumper' | 'far';

const MODES: CameraMode[] = ['chase', 'far', 'bumper'];

/** Câmera de perseguição com mola (estilo Driver), câmera de para-choque e olhar para trás. */
export class CameraRig {
  mode: CameraMode = 'chase';
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private yaw = 0;
  private initialized = false;
  /** Meio comprimento do carro e altura do teto acima do centro do chassi (ônibus pedem a câmera mais longe). */
  private halfLength = 2.3;
  private roofAbove = 0.71;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** Ajusta as distâncias ao tamanho do carro. */
  fit(halfLength: number, roofAbove: number): void {
    this.halfLength = halfLength;
    this.roofAbove = roofAbove;
    this.initialized = false;
  }

  cycle(): CameraMode {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]!;
    this.initialized = false;
    return this.mode;
  }

  /** Reposiciona sem suavização (teleporte, reset). */
  snap(): void {
    this.initialized = false;
  }

  update(
    target: THREE.Vector3,
    quat: THREE.Quaternion,
    heading: number,
    speed: number,
    lookBack: boolean,
    dt: number,
  ): void {
    const cam = this.camera;
    if (this.mode === 'bumper') {
      const fwd = new THREE.Vector3(0, 0, lookBack ? -1 : 1).applyQuaternion(quat);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
      cam.position
        .copy(target)
        .addScaledVector(up, Math.max(0.55, this.roofAbove - 0.3))
        .addScaledVector(fwd, lookBack ? -(this.halfLength - 0.1) : Math.max(0.4, this.halfLength - 1.9));
      cam.up.copy(up);
      cam.lookAt(cam.position.clone().addScaledVector(fwd, 10));
      return;
    }
    cam.up.set(0, 1, 0);
    // Rumo da câmera segue o carro com atraso; em ré, continua atrás da traseira.
    const desiredYaw = heading + (lookBack ? Math.PI : 0);
    if (!this.initialized) this.yaw = desiredYaw;
    let d = desiredYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-dt * (lookBack ? 30 : 4.5)));
    const far = this.mode === 'far';
    const dist = far ? Math.max(9.5, this.halfLength + 7.2) : Math.max(6.4, this.halfLength + 4.1);
    const height = far ? Math.max(3.6, this.roofAbove + 2.5) : Math.max(2.3, this.roofAbove + 1.2);
    const fx = Math.sin(this.yaw),
      fz = Math.cos(this.yaw);
    const extra = Math.min(1.2, Math.abs(speed) / 40);
    const desired = new THREE.Vector3(
      target.x - fx * (dist + extra),
      target.y + height,
      target.z - fz * (dist + extra),
    );
    const desiredLook = new THREE.Vector3(target.x + fx * 3, target.y + 0.9, target.z + fz * 3);
    if (!this.initialized) {
      this.pos.copy(desired);
      this.look.copy(desiredLook);
      this.initialized = true;
    }
    const kPos = 1 - Math.exp(-dt * 10);
    const kLook = 1 - Math.exp(-dt * 14);
    this.pos.lerp(desired, kPos);
    this.look.lerp(desiredLook, kLook);
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
  }
}
