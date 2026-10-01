import * as THREE from 'three';
import { decompressFrame, parseGIF, type ParsedGif } from 'gifuct-js';
import type { CityStateEntry, LayoutLot } from '@drivemart/shared';
import { SHOP_HEIGHT } from '../world/cityGen';
import type { WorldUniforms } from '../world/Ps1Material';
import { facadeCenter, type ParcelIndex } from './ParcelIndex';

type FacadeInfo = NonNullable<CityStateEntry['f']>;
type GifFrame = Parameters<typeof decompressFrame>[0];

interface GifState {
  gif: ParsedGif;
  frames: GifFrame[];
  index: number;
  elapsed: number;
  delay: number;
  full: HTMLCanvasElement;
  fullCtx: CanvasRenderingContext2D;
  patch: HTMLCanvasElement;
  prevDisposal: number;
  prevRect: { left: number; top: number; width: number; height: number } | null;
}

interface Overlay {
  lotId: string;
  key: string;
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  info: FacadeInfo;
  gif: GifState | null;
}

const LOAD_RADIUS = 260;
const UNLOAD_RADIUS = 360;
const MAX_ANIMATED = 8;

/** Dimensões da área da fachada coberta pela imagem (largura x altura em metros). */
export function facadeArea(
  lot: LayoutLot,
  region: FacadeInfo['r'],
): { width: number; y0: number; y1: number } {
  const width = Math.max(1, Math.hypot(lot.f[2] - lot.f[0], lot.f[3] - lot.f[1]) - 0.2);
  const top = region === 'ground' && lot.h > 6 ? SHOP_HEIGHT : lot.h;
  return { width, y0: lot.y + 0.1, y1: lot.y + top - 0.1 };
}

/** Desenha a imagem ajustada (cobrir ou conter) sobre o fundo. */
export function drawFit(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  fit: FacadeInfo['fit'],
  bg: string,
): void {
  const cw = ctx.canvas.width,
    ch = ctx.canvas.height;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);
  const s = fit === 'cover' ? Math.max(cw / sw, ch / sh) : Math.min(cw / sw, ch / sh);
  const dw = sw * s,
    dh = sh * s;
  ctx.drawImage(src, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Reduz a 15 bits com dithering, como as texturas da cidade. */
export function ps1Quantize(ctx: CanvasRenderingContext2D): void {
  const { width, height } = ctx.canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const b = (BAYER[(y & 3) * 4 + (x & 3)]! / 16 - 0.5) * 8;
      for (let c = 0; c < 3; c++)
        d[p + c] = Math.round(Math.min(255, Math.max(0, d[p + c]! + b)) / 8.226) * 8.226;
    }
  ctx.putImageData(img, 0, 0);
}

/** Fachadas personalizadas pelos donos: quad sobreposto à face da rua, com imagem ou GIF animado. */
export class FacadeManager {
  readonly group = new THREE.Group();
  private overlays = new Map<string, Overlay>();
  private loading = new Set<string>();
  private wanted = new Map<string, FacadeInfo>();
  private material: THREE.ShaderMaterial;

  constructor(
    private readonly index: ParcelIndex,
    uniforms: WorldUniforms,
  ) {
    this.group.name = 'fachadas';
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        fogColor: uniforms.fogColor,
        fogNear: uniforms.fogNear,
        fogFar: uniforms.fogFar,
        night: uniforms.night,
        map: { value: null },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vDepth;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;
        uniform float night;
        varying vec2 vUv;
        varying float vDepth;
        void main() {
          vec3 c = texture2D(map, vUv).rgb;
          // À noite a fachada vira um letreiro iluminado.
          c *= mix(0.95, 1.15, night);
          float fog = smoothstep(fogNear, fogFar, vDepth) * mix(1.0, 0.6, night);
          gl_FragColor = vec4(mix(c, fogColor, fog), 1.0);
        }
      `,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
  }

  /** Atualiza a lista de fachadas a exibir a partir do estado público dos lotes. */
  sync(entries: Record<string, CityStateEntry>): void {
    this.wanted.clear();
    for (const [id, e] of Object.entries(entries)) if (e.f) this.wanted.set(id, e.f);
    for (const [id, ov] of this.overlays) {
      const f = this.wanted.get(id);
      if (!f || keyOf(f) !== ov.key) this.remove(id);
    }
  }

  private remove(id: string): void {
    const ov = this.overlays.get(id);
    if (!ov) return;
    this.group.remove(ov.mesh);
    ov.mesh.geometry.dispose();
    (ov.mesh.material as THREE.Material).dispose();
    ov.texture.dispose();
    this.overlays.delete(id);
  }

  private async load(lot: LayoutLot, info: FacadeInfo): Promise<void> {
    const key = keyOf(info);
    this.loading.add(lot.id);
    try {
      const res = await fetch(info.u, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const area = facadeArea(lot, info.r);
      const aspect = area.width / Math.max(0.5, area.y1 - area.y0);
      const max = info.ps1 ? 128 : 512;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(aspect >= 1 ? max : Math.max(16, max * aspect));
      canvas.height = Math.round(aspect >= 1 ? Math.max(16, max / aspect) : max);
      const ctx = canvas.getContext('2d', { willReadFrequently: info.ps1 })!;
      ctx.imageSmoothingEnabled = !info.ps1;
      let gif: GifState | null = null;
      if (info.k === 'gif') {
        gif = createGif(await res.arrayBuffer());
        advanceGif(gif);
        drawFit(ctx, gif.full, gif.full.width, gif.full.height, info.fit, info.bg);
      } else {
        const bmp = await createImageBitmap(await res.blob());
        drawFit(ctx, bmp, bmp.width, bmp.height, info.fit, info.bg);
        bmp.close();
      }
      if (info.ps1) ps1Quantize(ctx);
      // A fachada pode ter mudado enquanto carregava.
      const current = this.wanted.get(lot.id);
      if (!current || keyOf(current) !== key) return;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.NoColorSpace;
      if (info.ps1) {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
      } else {
        texture.anisotropy = 4;
      }
      const material = this.material.clone();
      material.uniforms.map = { value: texture };
      const mesh = new THREE.Mesh(facadeGeometry(lot, info.r), material);
      mesh.name = `fachada ${lot.id}`;
      this.group.add(mesh);
      this.overlays.set(lot.id, { lotId: lot.id, key, mesh, canvas, ctx, texture, info, gif });
    } catch (err) {
      console.warn('[fachada]', lot.id, err);
    } finally {
      this.loading.delete(lot.id);
    }
  }

  update(x: number, z: number, dt: number): void {
    // Carrega as mais próximas primeiro (até 3 ao mesmo tempo).
    const candidates: { lot: LayoutLot; d: number; info: FacadeInfo }[] = [];
    for (const [id, info] of this.wanted) {
      if (this.overlays.has(id) || this.loading.has(id)) continue;
      const lot = this.index.byId.get(id);
      if (!lot) continue;
      const [fx, fz] = facadeCenter(lot);
      const d = Math.hypot(fx - x, fz - z);
      if (d < LOAD_RADIUS) candidates.push({ lot, d, info });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const c of candidates.slice(0, Math.max(0, 3 - this.loading.size))) void this.load(c.lot, c.info);

    const animated: { ov: Overlay; d: number }[] = [];
    for (const ov of this.overlays.values()) {
      const lot = this.index.byId.get(ov.lotId)!;
      const [fx, fz] = facadeCenter(lot);
      const d = Math.hypot(fx - x, fz - z);
      if (d > UNLOAD_RADIUS) {
        this.remove(ov.lotId);
        continue;
      }
      if (ov.gif) animated.push({ ov, d });
    }
    animated.sort((a, b) => a.d - b.d);
    for (const { ov } of animated.slice(0, MAX_ANIMATED)) {
      const g = ov.gif!;
      g.elapsed += dt * 1000;
      if (g.elapsed < g.delay) continue;
      g.elapsed = 0;
      advanceGif(g);
      drawFit(ov.ctx, g.full, g.full.width, g.full.height, ov.info.fit, ov.info.bg);
      if (ov.info.ps1) ps1Quantize(ov.ctx);
      ov.texture.needsUpdate = true;
    }
  }

  get count(): number {
    return this.overlays.size;
  }
}

function keyOf(f: FacadeInfo): string {
  return `${f.u}|${f.v}|${f.fit}|${f.r}|${f.ps1}|${f.bg}`;
}

/** Quad voltado para a rua, levemente à frente da fachada. */
export function facadeGeometry(lot: LayoutLot, region: FacadeInfo['r']): THREE.BufferGeometry {
  const [nx, nz] = lot.n;
  // Direita de quem olha a fachada da rua: d = (nz, -nx).
  const dx = nz,
    dz = -nx;
  const a = [lot.f[0], lot.f[1]] as const,
    b = [lot.f[2], lot.f[3]] as const;
  const pa = a[0] * dx + a[1] * dz,
    pb = b[0] * dx + b[1] * dz;
  const [L, R] = pa <= pb ? [a, b] : [b, a];
  const len = Math.hypot(R[0] - L[0], R[1] - L[1]);
  const inset = Math.min(0.1, len * 0.05);
  const ux = (R[0] - L[0]) / len,
    uz = (R[1] - L[1]) / len;
  const off = 0.08;
  const lx = L[0] + ux * inset + nx * off,
    lz = L[1] + uz * inset + nz * off;
  const rx = R[0] - ux * inset + nx * off,
    rz = R[1] - uz * inset + nz * off;
  const { y0, y1 } = facadeArea(lot, region);
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([lx, y0, lz, rx, y0, rz, rx, y1, rz, lx, y1, lz], 3),
  );
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeBoundingSphere();
  return g;
}

function createGif(buffer: ArrayBuffer): GifState {
  const gif = parseGIF(buffer);
  const frames = gif.frames.filter((f): f is GifFrame => 'image' in f);
  if (!frames.length) throw new Error('GIF sem quadros');
  const full = document.createElement('canvas');
  full.width = gif.lsd.width;
  full.height = gif.lsd.height;
  return {
    gif,
    frames,
    index: -1,
    elapsed: 0,
    delay: 100,
    full,
    fullCtx: full.getContext('2d')!,
    patch: document.createElement('canvas'),
    prevDisposal: 0,
    prevRect: null,
  };
}

/** Avança um quadro respeitando o descarte do quadro anterior. */
function advanceGif(g: GifState): void {
  if (g.prevDisposal === 2 && g.prevRect) {
    g.fullCtx.clearRect(g.prevRect.left, g.prevRect.top, g.prevRect.width, g.prevRect.height);
  }
  g.index = (g.index + 1) % g.frames.length;
  if (g.index === 0) g.fullCtx.clearRect(0, 0, g.full.width, g.full.height);
  const f = decompressFrame(g.frames[g.index]!, g.gif.gct, true);
  const { width, height, left, top } = f.dims;
  if (width > 0 && height > 0) {
    g.patch.width = width;
    g.patch.height = height;
    const pctx = g.patch.getContext('2d')!;
    pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), width, height), 0, 0);
    g.fullCtx.drawImage(g.patch, left, top);
  }
  g.delay = Math.max(40, f.delay || 100);
  g.prevDisposal = f.disposalType;
  g.prevRect = { left, top, width, height };
}
