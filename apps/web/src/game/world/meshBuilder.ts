/**
 * Acumula vértices no formato usado pelo material PS1:
 * posição, UV (repetível), camada da textura, tinta (cor do prédio) e sombreamento assado.
 */

export interface MeshData {
  position: Float32Array;
  uv: Float32Array;
  layer: Uint8Array;
  /** RGB normalizado com a tinta dividida por 2 (o shader multiplica por 2). */
  tint: Uint8Array;
  shade: Uint8Array;
  index: Uint32Array;
}

export type Vec3 = [number, number, number];

/** Direção do sol usada para assar o sombreamento das faces. */
const SUN: Vec3 = (() => {
  const v: Vec3 = [0.45, 0.8, 0.35];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

export function faceShade(nx: number, ny: number, nz: number): number {
  const d = nx * SUN[0] + ny * SUN[1] + nz * SUN[2];
  return Math.min(1, 0.58 + 0.42 * Math.max(0, d));
}

export class MeshBuilder {
  private pos: number[] = [];
  private uvs: number[] = [];
  private layers: number[] = [];
  private tints: number[] = [];
  private shades: number[] = [];
  private idx: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  vertex(
    x: number,
    y: number,
    z: number,
    u: number,
    v: number,
    layer: number,
    tint: Vec3,
    shade: number,
  ): number {
    this.pos.push(x, y, z);
    this.uvs.push(u, v);
    this.layers.push(layer);
    this.tints.push(
      Math.min(255, Math.round(tint[0] * 127.5)),
      Math.min(255, Math.round(tint[1] * 127.5)),
      Math.min(255, Math.round(tint[2] * 127.5)),
    );
    this.shades.push(Math.min(255, Math.round(shade * 255)));
    return this.pos.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /**
   * Quad a-b-c-d (anti-horário visto de frente) com UV por vértice.
   * `uv` = [u0, v0, u1, v1] para a (u0,v1), b (u1,v1), c (u1,v0), d (u0,v0).
   */
  quad(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    d: Vec3,
    uv: [number, number, number, number],
    layer: number,
    tint: Vec3,
    shade: number,
  ): void {
    const [u0, v0, u1, v1] = uv;
    const i0 = this.vertex(a[0], a[1], a[2], u0, v1, layer, tint, shade);
    const i1 = this.vertex(b[0], b[1], b[2], u1, v1, layer, tint, shade);
    const i2 = this.vertex(c[0], c[1], c[2], u1, v0, layer, tint, shade);
    const i3 = this.vertex(d[0], d[1], d[2], u0, v0, layer, tint, shade);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  /**
   * Parede vertical do ponto (x0,z0) ao (x1,z1), de y0 a y1. A face visível tem normal (-dz, dx)
   * (regra da mão direita com Y para cima). UV repete a cada `tileW` metros na horizontal e `tileH` na vertical, com v=0 no topo.
   */
  wall(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    y1: number,
    layer: number,
    tint: Vec3,
    tileW: number,
    tileH: number,
    vTop = 0,
    uStart = 0,
  ): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-4 || y1 - y0 < 1e-4) return;
    const nx = -(z1 - z0) / len,
      nz = (x1 - x0) / len;
    const shade = faceShade(nx, 0, nz);
    const u1 = uStart + len / tileW;
    const vb = vTop + (y1 - y0) / tileH;
    this.quad(
      [x0, y0, z0],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z0],
      [uStart, vTop, u1, vb],
      layer,
      tint,
      shade,
    );
  }

  /** Caixa orientada: centro, meias-dimensões e rotação em Y. Sem a face de baixo. */
  box(
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rot: number,
    layer: number,
    tint: Vec3,
    tile = 1,
    topLayer = layer,
  ): void {
    const c = Math.cos(rot),
      s = Math.sin(rot);
    const p = (x: number, z: number): [number, number] => [cx + c * x + s * z, cz - s * x + c * z];
    const corners = [p(-hx, -hz), p(hx, -hz), p(hx, hz), p(-hx, hz)];
    const y0 = cy - hy,
      y1 = cy + hy;
    // Percorre os cantos ao contrário para a normal (-dz, dx) de cada parede apontar para fora.
    for (let k = 0; k < 4; k++) {
      const a = corners[(4 - k) % 4]!,
        b = corners[(3 - k + 4) % 4]!;
      this.wall(a[0], a[1], b[0], b[1], y0, y1, layer, tint, tile, tile);
    }
    const t = corners;
    const sh = faceShade(0, 1, 0);
    const w = (2 * hx) / tile,
      d = (2 * hz) / tile;
    const i0 = this.vertex(t[0]![0], y1, t[0]![1], 0, 0, topLayer, tint, sh);
    const i1 = this.vertex(t[1]![0], y1, t[1]![1], w, 0, topLayer, tint, sh);
    const i2 = this.vertex(t[2]![0], y1, t[2]![1], w, d, topLayer, tint, sh);
    const i3 = this.vertex(t[3]![0], y1, t[3]![1], 0, d, topLayer, tint, sh);
    this.idx.push(i0, i2, i1, i0, i3, i2);
  }

  /** Cilindro vertical (ou cone, com raio do topo diferente) com `seg` lados. */
  cylinder(
    cx: number,
    cy: number,
    cz: number,
    r0: number,
    r1: number,
    h: number,
    seg: number,
    layer: number,
    tint: Vec3,
    capLayer = -1,
  ): void {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2,
        a1 = ((k + 1) / seg) * Math.PI * 2;
      const nx = Math.cos((a0 + a1) / 2),
        nz = Math.sin((a0 + a1) / 2);
      const sh = faceShade(nx, 0, nz);
      this.quad(
        [cx + Math.cos(a1) * r0, cy, cz + Math.sin(a1) * r0],
        [cx + Math.cos(a0) * r0, cy, cz + Math.sin(a0) * r0],
        [cx + Math.cos(a0) * r1, cy + h, cz + Math.sin(a0) * r1],
        [cx + Math.cos(a1) * r1, cy + h, cz + Math.sin(a1) * r1],
        [(k + 1) / seg, 0, k / seg, 1],
        layer,
        tint,
        sh,
      );
    }
    if (capLayer >= 0 && r1 > 0) {
      const center = this.vertex(cx, cy + h, cz, 0.5, 0.5, capLayer, tint, 1);
      const ring: number[] = [];
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        ring.push(
          this.vertex(
            cx + Math.cos(a) * r1,
            cy + h,
            cz + Math.sin(a) * r1,
            0.5 + Math.cos(a) * 0.5,
            0.5 + Math.sin(a) * 0.5,
            capLayer,
            tint,
            1,
          ),
        );
      }
      for (let k = 0; k < seg; k++) this.idx.push(center, ring[(k + 1) % seg]!, ring[k]!);
    }
  }

  /** Copia outra malha aplicando rotação em Y e translação. */
  append(other: MeshData, x: number, y: number, z: number, rot: number): void {
    const base = this.vertexCount;
    const c = Math.cos(rot),
      s = Math.sin(rot);
    const n = other.position.length / 3;
    for (let i = 0; i < n; i++) {
      const px = other.position[i * 3]!,
        py = other.position[i * 3 + 1]!,
        pz = other.position[i * 3 + 2]!;
      this.pos.push(x + c * px + s * pz, y + py, z - s * px + c * pz);
      this.uvs.push(other.uv[i * 2]!, other.uv[i * 2 + 1]!);
      this.layers.push(other.layer[i]!);
      this.tints.push(other.tint[i * 3]!, other.tint[i * 3 + 1]!, other.tint[i * 3 + 2]!);
      this.shades.push(other.shade[i]!);
    }
    for (const k of other.index) this.idx.push(base + k);
  }

  build(): MeshData {
    return {
      position: new Float32Array(this.pos),
      uv: new Float32Array(this.uvs),
      layer: new Uint8Array(this.layers),
      tint: new Uint8Array(this.tints),
      shade: new Uint8Array(this.shades),
      index: new Uint32Array(this.idx),
    };
  }
}
