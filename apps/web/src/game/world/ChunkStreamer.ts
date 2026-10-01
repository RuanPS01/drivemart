import * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import type { ChunkBuild, ChunkColliders } from './cityGen';
import { geometryFromData, treeGeometry } from './three';
import type { WorkerRequest, WorkerResponse } from './cityWorker';

interface LoadedChunk {
  key: string;
  cx: number;
  cz: number;
  group: THREE.Group;
  colliders: ChunkColliders;
}

export interface StreamerOptions {
  chunkSize: number;
  renderRadius: number;
  physicsRadius: number;
  maxInFlight: number;
}

/**
 * Carrega e descarrega os chunks da cidade ao redor de um ponto.
 * A geometria é gerada no worker; os colisores só existem perto do carro.
 */
export class ChunkStreamer {
  private worker: Worker;
  private keys = new Set<string>();
  private loaded = new Map<string, LoadedChunk>();
  private pending = new Set<string>();
  private readyResolve!: () => void;
  readonly ready: Promise<void>;
  readonly root = new THREE.Group();
  private lastFocus = new THREE.Vector3(Infinity, 0, Infinity);

  constructor(
    layoutUrl: string,
    private readonly physics: Physics,
    private readonly material: THREE.Material,
    private readonly treeMaterial: THREE.Material,
    readonly opts: StreamerOptions,
  ) {
    this.root.name = 'city';
    this.ready = new Promise((r) => (this.readyResolve = r));
    this.worker = new Worker(new URL('./cityWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onMessage(ev.data);
    this.worker.postMessage({ type: 'init', url: layoutUrl } satisfies WorkerRequest);
  }

  private onMessage(msg: WorkerResponse): void {
    if (msg.type === 'ready') {
      this.keys = new Set(msg.keys);
      this.readyResolve();
    } else if (msg.type === 'chunk') {
      this.pending.delete(msg.chunk.key);
      this.addChunk(msg.chunk);
    } else {
      console.error('[cidade]', msg.message);
    }
  }

  private addChunk(c: ChunkBuild): void {
    const [cx, cz] = c.key.split(',').map(Number) as [number, number];
    const group = new THREE.Group();
    group.name = `chunk ${c.key}`;
    if (c.mesh.index.length) group.add(new THREE.Mesh(geometryFromData(c.mesh), this.material));
    if (c.trees.index.length) group.add(new THREE.Mesh(treeGeometry(c.trees), this.treeMaterial));
    this.root.add(group);
    this.loaded.set(c.key, { key: c.key, cx, cz, group, colliders: c.colliders });
    this.updatePhysics(this.lastFocus);
  }

  private removeChunk(key: string): void {
    const ch = this.loaded.get(key);
    if (!ch) return;
    this.root.remove(ch.group);
    ch.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.physics.removeChunk(key);
    this.loaded.delete(key);
  }

  private distanceTo(cx: number, cz: number, p: THREE.Vector3): number {
    const s = this.opts.chunkSize;
    const dx = Math.max(cx * s - p.x, 0, p.x - (cx + 1) * s);
    const dz = Math.max(cz * s - p.z, 0, p.z - (cz + 1) * s);
    return Math.hypot(dx, dz);
  }

  private updatePhysics(focus: THREE.Vector3): void {
    for (const ch of this.loaded.values()) {
      const d = this.distanceTo(ch.cx, ch.cz, focus);
      if (d <= this.opts.physicsRadius) this.physics.addChunk(ch.key, ch.colliders);
      else if (d > this.opts.physicsRadius + 40) this.physics.removeChunk(ch.key);
    }
  }

  /** Chunks necessários para a física ao redor do ponto já estão carregados? */
  physicsReady(focus: THREE.Vector3): boolean {
    const s = this.opts.chunkSize;
    const ci = Math.floor(focus.x / s),
      cj = Math.floor(focus.z / s);
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++) {
        const key = `${i},${j}`;
        if (
          this.keys.has(key) &&
          this.distanceTo(i, j, focus) <= this.opts.physicsRadius &&
          !this.physics.hasChunk(key)
        )
          return false;
      }
    return true;
  }

  get loadedCount(): number {
    return this.loaded.size;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  update(focus: THREE.Vector3): void {
    if (!this.keys.size) return;
    this.lastFocus.copy(focus);
    const s = this.opts.chunkSize;
    const r = this.opts.renderRadius;
    const want: { key: string; d: number }[] = [];
    const ci0 = Math.floor((focus.x - r) / s),
      ci1 = Math.floor((focus.x + r) / s);
    const cj0 = Math.floor((focus.z - r) / s),
      cj1 = Math.floor((focus.z + r) / s);
    for (let i = ci0; i <= ci1; i++)
      for (let j = cj0; j <= cj1; j++) {
        const key = `${i},${j}`;
        if (!this.keys.has(key)) continue;
        const d = this.distanceTo(i, j, focus);
        if (d <= r && !this.loaded.has(key) && !this.pending.has(key)) want.push({ key, d });
      }
    want.sort((a, b) => a.d - b.d);
    for (const w of want) {
      if (this.pending.size >= this.opts.maxInFlight) break;
      this.pending.add(w.key);
      this.worker.postMessage({ type: 'build', key: w.key } satisfies WorkerRequest);
    }
    for (const ch of [...this.loaded.values()]) {
      if (this.distanceTo(ch.cx, ch.cz, focus) > r + s) this.removeChunk(ch.key);
    }
    this.updatePhysics(focus);
  }

  /** Descarta tudo e recarrega em volta de outro ponto (teleporte). */
  dispose(): void {
    for (const key of [...this.loaded.keys()]) this.removeChunk(key);
    this.worker.terminate();
  }
}
