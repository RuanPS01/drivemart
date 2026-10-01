import * as THREE from 'three';
import type { CityStateEntry, LayoutLot } from '@drivemart/shared';
import type { ParcelIndex } from './ParcelIndex';

/** Cores das vagas por situação do lote. */
export const ZONE_COLORS = {
  available: new THREE.Color('#3ddc84'),
  for_sale: new THREE.Color('#ffcc33'),
  shop: new THREE.Color('#4fb3ff'),
  owned: new THREE.Color('#b0b8c8'),
  mine: new THREE.Color('#ff8c1a'),
  reserved: new THREE.Color('#8a8f99'),
  target: new THREE.Color('#ff3df2'),
};

export type ZoneLook = keyof typeof ZONE_COLORS;

export function zoneLook(entry: CityStateEntry | undefined, myUid: string | null): ZoneLook {
  if (!entry) return 'available';
  if (myUid && entry.ou === myUid) return 'mine';
  if (entry.s === 'for_sale') return 'for_sale';
  if (entry.s === 'reserved') return 'reserved';
  return entry.l ? 'shop' : 'owned';
}

function frameTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(8, 8, s - 16, s - 16);
  ctx.fillStyle = '#fff';
  const t = 8;
  ctx.fillRect(0, 0, s, t);
  ctx.fillRect(0, s - t, s, t);
  ctx.fillRect(0, 0, t, s);
  ctx.fillRect(s - t, 0, t, s);
  // Listras diagonais finas, como uma vaga pintada.
  ctx.globalAlpha = 0.35;
  for (let x = -s; x < s; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, s);
    ctx.lineTo(x + s, 0);
    ctx.lineTo(x + s + 8, 0);
    ctx.lineTo(x + 8, s);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

const MAX = 160;

/** Vagas pintadas na pista e colunas de luz para as zonas próximas. */
export class ZoneMarkers {
  readonly group = new THREE.Group();
  private frames: THREE.InstancedMesh;
  private beams: THREE.InstancedMesh;
  private timer = 0;
  private dummy = new THREE.Object3D();
  target: string | null = null;

  constructor(private readonly index: ParcelIndex) {
    const frameGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const frameMat = new THREE.MeshBasicMaterial({
      map: frameTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.frames = new THREE.InstancedMesh(frameGeo, frameMat, MAX);
    this.frames.frustumCulled = false;
    this.frames.renderOrder = 2;
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beams = new THREE.InstancedMesh(beamGeo, beamMat, 48);
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 3;
    this.group.add(this.frames, this.beams);
    this.frames.count = 0;
    this.beams.count = 0;
  }

  update(
    x: number,
    z: number,
    dt: number,
    entries: Record<string, CityStateEntry>,
    myUid: string | null,
    force = false,
  ): void {
    this.timer += dt;
    if (this.timer < 0.25 && !force) return;
    this.timer = 0;
    const near = this.index.zonesNear(x, z, 70);
    near.sort((a, b) => Math.hypot(a.z![0] - x, a.z![1] - z) - Math.hypot(b.z![0] - x, b.z![1] - z));
    let fi = 0,
      bi = 0;
    const place = (lot: LayoutLot) => {
      const [cx, cz, y, angle, w, d] = lot.z!;
      const tx = Math.cos(angle),
        tz = Math.sin(angle);
      this.dummy.position.set(cx, y + 0.05, cz);
      this.dummy.rotation.set(0, Math.atan2(-tz, tx), 0);
      this.dummy.scale.set(w, 1, d);
      this.dummy.updateMatrix();
    };
    for (const lot of near) {
      if (fi >= MAX) break;
      const look = lot.id === this.target ? 'target' : zoneLook(entries[lot.id], myUid);
      place(lot);
      this.frames.setMatrixAt(fi, this.dummy.matrix);
      this.frames.setColorAt(fi, ZONE_COLORS[look]);
      fi++;
      const dist = Math.hypot(lot.z![0] - x, lot.z![1] - z);
      // Perto demais a coluna tapa a visão: some quando o carro está chegando na vaga.
      const showBeam = dist > 9 && (look !== 'available' || lot.id === this.target || dist < 22);
      if (showBeam && bi < 48) {
        this.dummy.position.set(lot.z![0], lot.z![2], lot.z![1]);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(0.9, look === 'target' ? 60 : 18, 0.9);
        this.dummy.updateMatrix();
        this.beams.setMatrixAt(bi, this.dummy.matrix);
        this.beams.setColorAt(bi, ZONE_COLORS[look]);
        bi++;
      }
    }
    // Alvo do GPS fora do raio: coluna alta visível de longe.
    if (this.target && !near.some((l) => l.id === this.target)) {
      const lot = this.index.byId.get(this.target);
      if (lot?.z && bi < 48) {
        this.dummy.position.set(lot.z[0], lot.z[2], lot.z[1]);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1.6, 120, 1.6);
        this.dummy.updateMatrix();
        this.beams.setMatrixAt(bi, this.dummy.matrix);
        this.beams.setColorAt(bi, ZONE_COLORS.target);
        bi++;
      }
    }
    this.frames.count = fi;
    this.beams.count = bi;
    this.frames.instanceMatrix.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true;
    if (this.frames.instanceColor) this.frames.instanceColor.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
  }
}
