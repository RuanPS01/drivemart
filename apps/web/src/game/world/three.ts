import * as THREE from 'three';
import type { TreeData } from './cityGen';
import type { MeshData } from './meshBuilder';

/** Converte os dados de malha do gerador em geometria do three.js. */
export function geometryFromData(d: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
  g.setAttribute('layer', new THREE.BufferAttribute(d.layer, 1));
  g.setAttribute('tint', new THREE.BufferAttribute(d.tint, 3, true));
  g.setAttribute('shade', new THREE.BufferAttribute(d.shade, 1, true));
  g.setIndex(new THREE.BufferAttribute(d.index, 1));
  g.computeBoundingSphere();
  return g;
}

export function meshFromData(d: MeshData, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geometryFromData(d), material);
}

export function treeGeometry(t: TreeData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(t.center, 3));
  g.setAttribute('center', new THREE.BufferAttribute(t.center, 3));
  g.setAttribute('corner', new THREE.BufferAttribute(t.corner, 2));
  g.setAttribute('uv', new THREE.BufferAttribute(t.uv, 2));
  g.setAttribute('layer', new THREE.BufferAttribute(t.layer, 1));
  g.setIndex(new THREE.BufferAttribute(t.index, 1));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 12;
  return g;
}
