import * as THREE from 'three';
import { PROP_STRIDE, type CityLayout } from '@drivemart/shared';
import { loadOverrides, paintLayers } from './art/TextureLibrary';
import { GameAudio } from './audio/GameAudio';
import { CameraRig } from './camera/CameraRig';
import { Input, type InputAction } from './input/Input';
import { RoadGraph } from './nav/RoadGraph';
import { RouteGuide, type RouteState } from './nav/RouteGuide';
import { FacadeManager } from './parcels/FacadeManager';
import { ParcelIndex } from './parcels/ParcelIndex';
import { ZoneDetector } from './parcels/ZoneDetector';
import { ZoneMarkers } from './parcels/ZoneMarkers';
import { CityStateSync } from '../services/cityState';
import { useAuth } from '../state/authStore';
import { useParcels } from '../state/parcelStore';
import { Physics } from './physics/Physics';
import { Car } from './vehicle/Car';
import { ChunkStreamer } from './world/ChunkStreamer';
import {
  createTextureArray,
  createTreeMaterial,
  createWorldMaterial,
  createWorldUniforms,
  LAMP_COUNT,
  type WorldUniforms,
} from './world/Ps1Material';
import { SmashProps } from './world/SmashProps';
import { createBackdrop, createSky, SKY } from './world/Sky';

export type GraphicsMode = 'ps1' | 'sharp';
export type ViewDistance = 'near' | 'normal' | 'far';

/** Raio de desenho e neblina para cada distância de visão. */
const VIEW: Record<ViewDistance, { radius: number; fogNear: number; fogFar: number }> = {
  near: { radius: 300, fogNear: 90, fogFar: 290 },
  normal: { radius: 460, fogNear: 140, fogFar: 440 },
  far: { radius: 640, fogNear: 200, fogFar: 620 },
};

export interface EngineEvents {
  progress?: (p: number, message: string) => void;
  route?: (r: RouteState | null) => void;
  arrived?: (lotId: string) => void;
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
  readonly parcels: ParcelIndex;
  private zones: ZoneDetector;
  private markers!: ZoneMarkers;
  private guide!: RouteGuide;
  private lastRoute: RouteState | null = null;
  private facades!: FacadeManager;
  private cityState: CityStateSync;
  private unsubs: (() => void)[] = [];
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
  private smash!: SmashProps;
  readonly audio = new GameAudio();
  private lamps: Float32Array = new Float32Array(0);
  private lampTimer = 0;
  private hold: { x: number; y: number; z: number; heading: number; since: number } | null = null;
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
    this.roads = RoadGraph.fromLattice(layout.roads);
    this.parcels = new ParcelIndex(layout.lots);
    this.zones = new ZoneDetector(this.parcels);
    this.cityState = new CityStateSync(layout.cityId);
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
    this.smash = new SmashProps(this.layout, world);
    this.smash.onSmash = (s) => this.audio.smash(s);
    this.scene.add(this.smash.group);
    this.lamps = collectLamps(this.layout);
    this.markers = new ZoneMarkers(this.parcels);
    this.facades = new FacadeManager(this.parcels, this.uniforms);
    this.guide = new RouteGuide(this.roads);
    this.scene.add(this.markers.group, this.facades.group, this.guide.group);
    this.facades.sync(useParcels.getState().entries);
    this.unsubs.push(
      useParcels.subscribe((st, prev) => {
        if (st.version !== prev.version) this.facades.sync(st.entries);
      }),
    );
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
    const n = this.roads.nearest(p.x, p.z, 600, true);
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
    const target = new THREE.Vector3(x, y, z);
    this.streamer.update(target);
    // Segura o carro no lugar até o chão da região ter colisão (senão ele cai antes de carregar).
    this.hold = this.streamer.physicsReady(target) ? null : { x, y, z, heading, since: performance.now() };
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

  /** Traça (ou limpa, com nulo) a rota de GPS até a zona de um lote. */
  setRoute(lotId: string | null): boolean {
    const lot = lotId ? this.parcels.byId.get(lotId) : undefined;
    if (!lot) {
      this.guide.clear();
      this.markers.target = null;
      this.events.route?.(null);
      return false;
    }
    const ok = this.guide.set(lot, this.car.position);
    this.markers.target = ok ? lot.id : null;
    if (ok) {
      const target = lot.id;
      this.guide.onArrive = () => {
        this.markers.target = null;
        this.events.arrived?.(target);
        this.events.route?.(null);
      };
    }
    return ok;
  }

  /** Teleporta para a zona de ação de um lote, alinhado à rua. */
  teleportToLot(lotId: string): boolean {
    const lot = this.parcels.byId.get(lotId);
    if (!lot?.z) return false;
    const [x, z, y, angle] = lot.z;
    // Carro paralelo à fachada; escolhe o sentido mais próximo do rumo da rua.
    const h1 = Math.atan2(Math.cos(angle), Math.sin(angle));
    const n = this.roads.nearest(x, z);
    const roadH = n >= 0 ? this.roads.headingAt(n, h1) : h1;
    const diff = Math.abs(Math.atan2(Math.sin(roadH - h1), Math.cos(roadH - h1)));
    this.teleport(x, y, z, diff > Math.PI / 2 ? h1 + Math.PI : h1);
    return true;
  }

  setInputEnabled(enabled: boolean): void {
    this.input.enabled = enabled;
    this.audio.setDucked(!enabled);
  }

  setVolume(volume: number): void {
    this.audio.setVolume(volume);
  }

  setViewDistance(level: ViewDistance): void {
    const v = VIEW[level] ?? VIEW.normal;
    this.streamer.opts.renderRadius = v.radius;
    this.uniforms.fogNear.value = v.fogNear;
    this.uniforms.fogFar.value = v.fogFar;
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
    if (this.hold) {
      const h = this.hold;
      if (
        this.streamer.physicsReady(new THREE.Vector3(h.x, h.y, h.z)) ||
        performance.now() - h.since > 15000
      ) {
        this.hold = null;
        this.car.place(h.x, h.y, h.z, h.heading);
      } else {
        this.car.place(h.x, h.y, h.z, h.heading);
        this.acc = 0;
      }
    }
    if (this.physicsLive && !this.hold) {
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

      // Objetos de rua que voam ao bater; a batida freia um pouco o carro.
      const lv = this.car.body.linvel();
      const vel = { x: lv.x, y: lv.y, z: lv.z };
      this.smash.update({ position: p, heading: this.car.heading, velocity: vel }, dt);
      if (vel.x !== lv.x || vel.z !== lv.z) this.car.body.setLinvel(vel, true);

      const impact = this.car.takeImpact();
      if (impact > 1.2) this.audio.impact((impact - 1.2) / 7);
      const skid =
        Math.max(0, (Math.abs(this.car.lateral) - 2.5) / 5) +
        (input.handbrake && Math.abs(this.car.speed) > 4 ? 0.5 : 0);
      this.audio.update({
        speed: this.car.speed,
        throttle: this.input.enabled ? Math.max(input.throttle, input.brake * 0.4) : 0,
        skid,
      });
    }
    this.car.sync(this.physicsLive ? this.acc / STEP : 1);
    const pos = this.car.object.position;
    this.streamer.update(pos);
    this.rig.update(pos, this.car.object.quaternion, this.car.heading, this.car.speed, input.lookBack, dt);
    const contact = this.zones.update(pos.x, pos.z, this.car.speed, dt);
    const parcelState = useParcels.getState();
    parcelState.setZone(contact);
    this.markers.update(pos.x, pos.z, dt, parcelState.entries, useAuth.getState().user?.uid ?? null);
    this.facades.update(pos.x, pos.z, dt);
    this.cityState.update(pos.x, pos.z);
    const route = this.guide.update(pos, dt);
    if (
      route?.lotId !== this.lastRoute?.lotId ||
      (route && Math.abs(route.distance - (this.lastRoute?.distance ?? 0)) > 5)
    ) {
      this.lastRoute = route;
      this.events.route?.(route);
    }
    this.sky.position.copy(this.camera.position);
    this.backdrop.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.uniforms.time.value += dt;
    this.uniforms.carPos.value.copy(pos);
    this.uniforms.carDir.value.set(Math.sin(this.car.heading), Math.cos(this.car.heading));
    this.lampTimer -= dt;
    if (this.uniforms.night.value > 0 && this.lampTimer <= 0) {
      this.lampTimer = 0.3;
      this.updateLamps(pos);
    }
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

  /** Escolhe as lâmpadas de poste mais próximas para iluminar o chão à noite. */
  private updateLamps(pos: THREE.Vector3): void {
    const best: [number, number][] = [];
    const l = this.lamps;
    for (let i = 0; i < l.length; i += 3) {
      const dx = l[i]! - pos.x,
        dz = l[i + 2]! - pos.z;
      const d = dx * dx + dz * dz;
      if (d > 120 * 120) continue;
      if (best.length < LAMP_COUNT) best.push([d, i]);
      else {
        let worst = 0;
        for (let k = 1; k < best.length; k++) if (best[k]![0] > best[worst]![0]) worst = k;
        if (d < best[worst]![0]) best[worst] = [d, i];
      }
    }
    const out = this.uniforms.lamps.value;
    for (let k = 0; k < LAMP_COUNT; k++) {
      const b = best[k];
      if (b) out[k]!.set(l[b[1]]!, l[b[1] + 1]!, l[b[1] + 2]!);
      else out[k]!.set(1e6, 0, 1e6);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.audio.dispose();
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    for (const u of this.unsubs) u();
    this.cityState.dispose();
    this.input.dispose();
    this.streamer.dispose();
    this.car.dispose();
    this.renderer.dispose();
  }
}

/** Posição das lâmpadas dos postes (x, y, z) a partir dos props do traçado. */
function collectLamps(layout: CityLayout): Float32Array {
  const out: number[] = [];
  for (let i = 0; i < layout.props.length; i += PROP_STRIDE) {
    const type = layout.propTypes[layout.props[i]!];
    const x = layout.props[i + 1]!,
      y = layout.props[i + 2]!,
      z = layout.props[i + 3]!,
      rot = layout.props[i + 4]!;
    // Mesma rotação de PROP_BUILDERS: o braço do poste aponta para +X local.
    if (type === 'streetlight') out.push(x + Math.cos(rot) * 2.3, y + 8.5, z - Math.sin(rot) * 2.3);
    else if (type === 'mastlight') out.push(x, y + 16.7, z);
  }
  return new Float32Array(out);
}
