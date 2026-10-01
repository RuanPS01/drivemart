import { identity, multiply, rotationY, transformPoint, vrmlTransform, type Mat4 } from './math';
import {
  isNode,
  isUse,
  itemsField,
  numField,
  type VrmlDocument,
  type VrmlItem,
  type VrmlNode,
} from './vrml/parser';

/** Parte de um modelo com uma única textura, em triângulos não indexados, coordenadas locais em metros. */
export interface ModelPart {
  texture: string | null;
  /** 9 valores por triângulo (3 vértices x, y, z). */
  positions: Float32Array;
  /** 6 valores por triângulo (3 vértices u, v) ou vazio. */
  uvs: Float32Array;
}

export interface Model {
  name: string;
  parts: ModelPart[];
  billboard: boolean;
  /** [minX, minY, minZ, maxX, maxY, maxZ] em metros. */
  bbox: [number, number, number, number, number, number];
  triangles: number;
}

export interface Instance {
  model: string;
  x: number;
  y: number;
  z: number;
  /** Rotação em Y, em radianos. */
  rot: number;
}

export interface Scene {
  /** DEF da textura para o arquivo (ex.: tex05 para 5.bmp). */
  textures: Map<string, string>;
  models: Map<string, Model>;
  instances: Instance[];
}

export interface SceneOptions {
  unitsPerMeter: number;
}

function resolve(doc: VrmlDocument, item: VrmlItem): VrmlNode | undefined {
  return isUse(item) ? doc.defs.get(item.use) : item;
}

function nodeMatrix(node: VrmlNode): Mat4 {
  if (node.type !== 'Transform') return identity();
  return vrmlTransform(
    numField(node, 'translation', [0, 0, 0]),
    numField(node, 'rotation', [0, 1, 0, 0]),
    numField(node, 'scale', [1, 1, 1]),
  );
}

function triangulate(index: number[]): number[] {
  const out: number[] = [];
  let face: number[] = [];
  const flush = () => {
    for (let k = 1; k + 1 < face.length; k++) out.push(face[0]!, face[k]!, face[k + 1]!);
    face = [];
  };
  for (const i of index) {
    if (i < 0) flush();
    else face.push(i);
  }
  flush();
  return out;
}

export function buildScene(doc: VrmlDocument, opts: SceneOptions): Scene {
  const k = 1 / opts.unitsPerMeter;
  const textures = new Map<string, string>();
  for (const [name, node] of doc.defs) {
    if (node.type === 'ImageTexture') {
      const url = node.fields.url;
      if (Array.isArray(url) && typeof url[0] === 'string') textures.set(name, url[0]);
    }
  }

  // Modelos: tudo que está dentro do Switch "Meshes" (ou qualquer Switch com whichChoice -1 que não seja de texturas).
  const modelNodes: VrmlNode[] = [];
  for (const item of doc.root) {
    if (isNode(item) && item.type === 'Switch' && item.def !== 'Textures') {
      for (const c of itemsField(item, 'choice')) if (isNode(c) && c.def) modelNodes.push(c);
    }
  }

  const models = new Map<string, Model>();
  for (const node of modelNodes) {
    const parts: ModelPart[] = [];
    let billboard = false;
    const bbox: Model['bbox'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    let triangles = 0;

    const visit = (n: VrmlNode, m: Mat4) => {
      if (n.type === 'Billboard') billboard = true;
      if (n.type === 'Shape') {
        const app = n.fields.appearance;
        let texture: string | null = null;
        if (isNode(app)) {
          const tex = app.fields.texture;
          if (isUse(tex)) texture = textures.get(tex.use) ?? null;
          else if (isNode(tex) && Array.isArray(tex.fields.url)) texture = String(tex.fields.url[0]);
        }
        const geo = n.fields.geometry;
        if (!isNode(geo) || geo.type !== 'IndexedFaceSet') return;
        const coordNode = isUse(geo.fields.coord) ? doc.defs.get(geo.fields.coord.use) : geo.fields.coord;
        const tcNode = isUse(geo.fields.texCoord)
          ? doc.defs.get(geo.fields.texCoord.use)
          : geo.fields.texCoord;
        const pts = isNode(coordNode) ? numField(coordNode, 'point', []) : [];
        const tcs = isNode(tcNode) ? numField(tcNode, 'point', []) : [];
        const ci = triangulate(numField(geo, 'coordIndex', []));
        const tiRaw = numField(geo, 'texCoordIndex', []);
        const ti = tiRaw.length ? triangulate(tiRaw) : ci;
        const nt = ci.length / 3;
        const positions = new Float32Array(nt * 9);
        const uvs = new Float32Array(tcs.length ? nt * 6 : 0);
        for (let v = 0; v < ci.length; v++) {
          const p = ci[v]! * 3;
          const [x, y, z] = transformPoint(m, pts[p]!, pts[p + 1]!, pts[p + 2]!);
          positions[v * 3] = x * k;
          positions[v * 3 + 1] = y * k;
          positions[v * 3 + 2] = z * k;
          bbox[0] = Math.min(bbox[0], x * k);
          bbox[1] = Math.min(bbox[1], y * k);
          bbox[2] = Math.min(bbox[2], z * k);
          bbox[3] = Math.max(bbox[3], x * k);
          bbox[4] = Math.max(bbox[4], y * k);
          bbox[5] = Math.max(bbox[5], z * k);
          if (uvs.length) {
            const t = ti[v]! * 2;
            uvs[v * 2] = tcs[t] ?? 0;
            uvs[v * 2 + 1] = tcs[t + 1] ?? 0;
          }
        }
        triangles += nt;
        parts.push({ texture, positions, uvs });
        return;
      }
      const mm = multiply(m, nodeMatrix(n));
      for (const c of [...itemsField(n, 'children'), ...itemsField(n, 'choice')]) {
        const r = resolve(doc, c);
        if (r) visit(r, mm);
      }
    };
    visit(node, identity());
    if (!parts.length) continue;
    models.set(node.def!, { name: node.def!, parts, billboard, bbox, triangles });
  }

  // Instâncias: percorre o mundo acumulando transformações até chegar num USE de modelo.
  const instances: Instance[] = [];
  const walk = (item: VrmlItem, m: Mat4) => {
    if (isUse(item)) {
      if (models.has(item.use)) {
        const [x, y, z] = transformPoint(m, 0, 0, 0);
        instances.push({ model: item.use, x: x * k, y: y * k, z: z * k, rot: rotationY(m) });
      }
      return;
    }
    if (item.type === 'Switch') return;
    const mm = multiply(m, nodeMatrix(item));
    for (const c of itemsField(item, 'children')) walk(c, mm);
  };
  for (const item of doc.root) {
    if (isNode(item) && (item.type === 'Switch' || item.type === 'Material' || item.type === 'ImageTexture'))
      continue;
    walk(item, identity());
  }

  return { textures, models, instances };
}
