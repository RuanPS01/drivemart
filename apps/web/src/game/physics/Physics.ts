import RAPIER from '@dimforge/rapier3d-compat';
import type { ChunkColliders } from '../world/cityGen';

export type Rapier = typeof RAPIER;

// Inicializar o WASM duas vezes troca a memória do módulo e invalida mundos já criados
// (acontece com o modo estrito do React montando o jogo duas vezes). Inicializa uma única vez.
let rapierReady: Promise<void> | null = null;

/** Mundo físico (Rapier) com os colisores estáticos da cidade agrupados por chunk. */
export class Physics {
  readonly world: RAPIER.World;
  private chunks = new Map<string, RAPIER.RigidBody>();

  private constructor(readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: -15, z: 0 });
    this.world.timestep = 1 / 60;
  }

  static async create(): Promise<Physics> {
    rapierReady ??= RAPIER.init();
    await rapierReady;
    return new Physics(RAPIER);
  }

  hasChunk(key: string): boolean {
    return this.chunks.has(key);
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  addChunk(key: string, c: ChunkColliders): void {
    if (this.chunks.has(key)) return;
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    if (c.groundIndex.length) {
      this.world.createCollider(R.ColliderDesc.trimesh(c.groundPosition, c.groundIndex).setFriction(1), body);
    }
    const b = c.boxes;
    for (let i = 0; i < b.length; i += 7) {
      const rot = b[i + 6]!;
      this.world.createCollider(
        R.ColliderDesc.cuboid(Math.max(0.05, b[i + 3]!), Math.max(0.05, b[i + 4]!), Math.max(0.05, b[i + 5]!))
          .setTranslation(b[i]!, b[i + 1]!, b[i + 2]!)
          .setRotation({ x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) })
          .setFriction(0.6)
          .setRestitution(0.1),
        body,
      );
    }
    this.chunks.set(key, body);
  }

  removeChunk(key: string): void {
    const body = this.chunks.get(key);
    if (!body) return;
    this.world.removeRigidBody(body);
    this.chunks.delete(key);
  }

  step(): void {
    this.world.step();
  }
}
