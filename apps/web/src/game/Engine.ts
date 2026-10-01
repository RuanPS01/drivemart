import * as THREE from 'three';
import type { CityLayout } from '@drivemart/shared';
import { loadOverrides, paintLayers } from './art/TextureLibrary';
import { CameraRig } from './camera/CameraRig';
import { Input, type InputAction } from './input/Input';
import { RoadGraph } from './nav/RoadGraph';
import { Physics } from './physics/Physics';
import { Car } from './vehicle/Car';
import { ChunkStreamer } from './world/ChunkStreamer';
import {
  createTextureArray,
  createTreeMaterial,
  createWorldMaterial,
  createWorldUniforms,
  type WorldUniforms,
} from './world/Ps1Material';
import { createBackdrop, createSky, SKY } from './world/Sky';

export type GraphicsMode = 'ps1' | 'sharp';

export interface EngineEvents {
  progress?: (p: number, message: string) => void;
  hud?: (h: { speedKmh: number; heading: number; position: [number, number]; cameraMode: string }) => void;
  action?: (a: InputAction) => void;
}

const STEP = 1 / 60;

/** Motor do jogo: renderização, física, streaming da cidade, carro e câmera. Vive fora do React. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly roads: RoadGraph;
  private rig: CameraRig;
  private car!: Car;
  private streamer!: ChunkStreamer;
  private uniforms!: WorldUniforms;
  private sky!: THREE.Mesh;
  private backdrop!: THREE.Mesh;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private hudTimer = 0;
  private physicsLive = false;
  private disposed = false;
  private graphics: GraphicsMode = 'ps1';
  private resizeObserver: ResizeObserver;
  readonly extraUpdaters = new Set<(dt: number) => void>();

  private constructor(
    readonly canvas: HTMLCanvasElement,
    readonly layout: CityLayout,
    readonly physics: Physics,
    private readonly events: EngineEvents,
  ) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 3000);
    this.input = new Input();
    this.rig = new CameraRig(this.camera);
    this.roads = new RoadGraph(layout.roads.nodes, layout.roads.edges);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  static async create(canvas: HTMLCanvasElement, cityId: string, events: EngineEvents = {}): Promise<Engine> {
    const report = events.progress ?? (() => {});
    report(0.05, 'Carregando a física...');
    const physicsP = Physics.create();
    report(0.15, 'Baixando o mapa da cidade...');
    const layoutUrl = `/cities/${cityId}/layout.json`;
    const layout = (await (await fetch(layoutUrl)).json()) as CityLayout;
    const physics = await physicsP;
    const engine = new Engine(canvas, layout, physics, events);
    report(0.35, 'Pintando as texturas...');
    await engine.setup(layoutUrl);
    report(0.55, 'Montando as ruas...');
    await engine.streamer.ready;
    await engine.waitForSpawnChunks(report);
    report(1, 'Pronto');
    return engine;
  }

  private async setup(layoutUrl: string): Promise<void> {
    const data = paintLayers();
    await loadOverrides(data);
    const tex = createTextureArray(data);
    this.uniforms = createWorldUniforms(tex);
    const world = createWorldMaterial(this.uniforms);
    const trees = createTreeMaterial(this.uniforms);
    this.sky = createSky(this.uniforms.night);
    this.backdrop = createBackdrop(this.uniforms);
    this.scene.add(this.sky, this.backdrop);
    this.streamer = new ChunkStreamer(layoutUrl, this.physics, world, trees, {
      chunkSize: this.layout.chunkSize,
      renderRadius: 460,
      physicsRadius: 150,
      maxInFlight: 4,
    });
    this.scene.add(this.streamer.root);
    this.car = new Car(this.physics, world, [1.6, 0.22, 0.18], this.layout.spawn);
    this.scene.add(this.car.object);
    this.input.onAction((a) => this.onAction(a));
    this.setGraphics('ps1');
    this.resize();
  }

  private async waitForSpawnChunks(report: (p: number, m: string) => void): Promise<void> {
    const spawn = new THREE.Vector3(this.layout.spawn[0], 0, this.layout.spawn[2]);
    const t0 = performance.now();
    while (!this.streamer.physicsReady(spawn) || this.streamer.loadedCount < 9) {
      this.streamer.update(spawn);
      report(0.55 + Math.min(0.4, this.streamer.loadedCount / 60), 'Construindo os prédios...');
      await new Promise((r) => setTimeout(r, 50));
      if (performance.now() - t0 > 30000) break;
    }
    this.physicsLive = true;
  }

  private onAction(a: InputAction): void {
    if (a === 'camera') this.rig.cycle();
    if (a === 'reset') this.resetToRoad();
    this.events.action?.(a);
  }

  /** Recoloca o carro na rua mais próxima, alinhado com ela. */
  resetToRoad(): void {
    const p = this.car.position;
    const n = this.roads.nearest(p.x, p.z);
    if (n < 0) return;
    this.teleport(
      this.roads.x(n),
      this.roads.y(n),
      this.roads.z(n),
      this.roads.headingAt(n, this.car.heading),
    );
  }

  teleport(x: number, y: number, z: number, heading: number): void {
    this.car.place(x, y, z, heading);
    this.rig.snap();
    this.streamer.update(new THREE.Vector3(x, y, z));
  }

  get carPosition(): THREE.Vector3 {
    return this.car.position;
  }

  get carHeading(): number {
    return this.car.heading;
  }

  get carSpeed(): number {
    return this.car.speed;
  }

  setInputEnabled(enabled: boolean): void {
    this.input.enabled = enabled;
  }

  setNight(night: boolean): void {
    this.uniforms.night.value = night ? 1 : 0;
    const fog = night ? SKY.night.fog : SKY.day.fog;
    this.uniforms.fogColor.value.copy(fog);
  }

  setGraphics(mode: GraphicsMode): void {
    this.graphics = mode;
    const ps1 = mode === 'ps1';
    this.uniforms.snapRes.value.set(ps1 ? 160 : 0, ps1 ? 120 : 0);
    this.uniforms.affine.value = ps1 ? 1 : 0;
    this.uniforms.dither.value = ps1 ? 1 : 0;
    this.canvas.style.imageRendering = ps1 ? 'pixelated' : 'auto';
    this.resize();
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    // Modo PS1: resolução interna perto de 480 linhas, ampliada sem suavização.
    const ratio = this.graphics === 'ps1' ? Math.min(1, 480 / h) : Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const aspect = w / h;
    if (this.uniforms && this.graphics === 'ps1')
      this.uniforms.snapRes.value.set(Math.round(120 * aspect), 120);
  }

  start(): void {
    this.last = performance.now();
    const tick = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private frame(dt: number): void {
    const input = this.input.read();
    if (this.physicsLive) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.car.savePrevious();
        this.car.control(input, STEP);
        this.physics.step();
        this.acc -= STEP;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      const p = this.car.position;
      if (p.y < -12) this.resetToRoad();
    }
    this.car.sync(this.physicsLive ? this.acc / STEP : 1);
    const pos = this.car.object.position;
    this.streamer.update(pos);
    this.rig.update(pos, this.car.object.quaternion, this.car.heading, this.car.speed, input.lookBack, dt);
    this.sky.position.copy(this.camera.position);
    this.backdrop.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.uniforms.time.value += dt;
    for (const u of this.extraUpdaters) u(dt);
    this.renderer.render(this.scene, this.camera);

    this.hudTimer += dt;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      this.events.hud?.({
        speedKmh: this.car.speedKmh,
        heading: this.car.heading,
        position: [pos.x, pos.z],
        cameraMode: this.rig.mode,
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.streamer.dispose();
    this.car.dispose();
    this.renderer.dispose();
  }
}
