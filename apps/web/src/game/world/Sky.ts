import * as THREE from 'three';
import { LAYER } from '../art/TextureLibrary';
import type { WorldUniforms } from './Ps1Material';

/** Paleta do céu por período. */
export const SKY = {
  day: {
    zenith: new THREE.Color(0.28, 0.5, 0.82),
    horizon: new THREE.Color(0.72, 0.81, 0.88),
    fog: new THREE.Color(0.72, 0.81, 0.88),
  },
  night: {
    zenith: new THREE.Color(0.01, 0.02, 0.07),
    horizon: new THREE.Color(0.07, 0.09, 0.16),
    fog: new THREE.Color(0.07, 0.09, 0.16),
  },
};

/** Cúpula de céu em degradê com nuvens e estrelas procedurais; acompanha a câmera. */
export function createSky(night: { value: number }): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      night,
      zenithDay: { value: SKY.day.zenith },
      horizonDay: { value: SKY.day.horizon },
      zenithNight: { value: SKY.night.zenith },
      horizonNight: { value: SKY.night.horizon },
    },
    vertexShader: /* glsl */ `
      out vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float night;
      uniform vec3 zenithDay, horizonDay, zenithNight, horizonNight;
      in vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 day = mix(horizonDay, zenithDay, pow(h, 0.55));
        vec2 uv = vDir.xz / max(vDir.y, 0.08) * 1.6;
        float c = noise(uv) * 0.6 + noise(uv * 2.7) * 0.3 + noise(uv * 6.1) * 0.1;
        c = smoothstep(0.55, 0.8, c) * smoothstep(0.02, 0.25, h);
        day = mix(day, vec3(0.97), c * 0.85);
        vec3 nightCol = mix(horizonNight, zenithNight, pow(h, 0.5));
        float star = step(0.9975, hash(floor(vDir.xz / max(vDir.y, 0.1) * 120.0))) * smoothstep(0.1, 0.4, h);
        nightCol += vec3(star);
        vec3 col = mix(day, nightCol, night);
        ivec2 q = ivec2(gl_FragCoord.xy) & 3;
        float b = float((q.x ^ q.y) * 4 + q.y) / 16.0 - 0.5;
        gl_FragColor = vec4(floor(clamp(col + b / 31.0, 0.0, 1.0) * 31.0 + 0.5) / 31.0, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Silhueta de morros ao redor da cidade (incluindo um "Pão de Açúcar" e um morro alto com o Cristo),
 * desenhada atrás de tudo e acompanhando a câmera, como um cenário pintado.
 */
export function createBackdrop(uniforms: WorldUniforms): THREE.Mesh {
  const seg = 96;
  const radius = 1200;
  const pos: number[] = [];
  const uv: number[] = [];
  const layer: number[] = [];
  const idx: number[] = [];
  const peaks = [
    { a: 0.15, h: 330, w: 0.05 }, // Pão de Açúcar
    { a: 0.21, h: 200, w: 0.035 },
    { a: 1.9, h: 420, w: 0.12 }, // Corcovado
    { a: 3.6, h: 260, w: 0.2 },
    { a: 4.7, h: 300, w: 0.15 },
  ];
  const heightAt = (a: number) => {
    let h = 70 + 40 * Math.sin(a * 3.1) + 25 * Math.sin(a * 7.3 + 1) + 12 * Math.sin(a * 17.9);
    for (const p of peaks) {
      let d = Math.abs(a - p.a);
      d = Math.min(d, Math.PI * 2 - d);
      h = Math.max(h, p.h * Math.exp(-((d / p.w) ** 2)));
    }
    return h;
  };
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a) * radius,
      z = Math.sin(a) * radius;
    const h = heightAt(a);
    const rocky = peaks.some((p) => Math.abs(a - p.a) < p.w * 0.6 && p.w < 0.06);
    const l = rocky ? LAYER.rock : LAYER.forest;
    pos.push(x, -40, z, x, h, z);
    uv.push(i * 1.5, 4, i * 1.5, 0);
    layer.push(l, l);
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('layer', new THREE.BufferAttribute(new Uint8Array(layer), 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: uniforms.map, fogColor: uniforms.fogColor, night: uniforms.night },
    vertexShader: /* glsl */ `
      in float layer;
      out vec2 vUv;
      out float vLayer;
      out float vH;
      void main() {
        vUv = uv;
        vLayer = layer;
        vH = position.y;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      precision highp sampler2DArray;
      uniform sampler2DArray map;
      uniform vec3 fogColor;
      uniform float night;
      in vec2 vUv;
      in float vLayer;
      in float vH;
      void main() {
        vec3 c = texture(map, vec3(vUv, floor(vLayer + 0.5))).rgb;
        float haze = mix(0.62, 0.35, clamp(vH / 400.0, 0.0, 1.0));
        c = mix(c, fogColor, haze);
        c *= mix(1.0, 0.35, night);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = -9;
  mesh.frustumCulled = false;
  return mesh;
}
