import * as THREE from 'three';
import { LAYER, LAYER_NAMES, LAYER_SIZE } from '../art/TextureLibrary';

/** Parâmetros visuais compartilhados por todos os materiais do mundo. */
export interface WorldUniforms {
  map: { value: THREE.DataArrayTexture };
  fogColor: { value: THREE.Color };
  fogNear: { value: number };
  fogFar: { value: number };
  /** Resolução da grade de snap dos vértices (0 desliga o efeito). */
  snapRes: { value: THREE.Vector2 };
  /** 1 = UV afim (deformação de PS1), 0 = UV com perspectiva correta. */
  affine: { value: number };
  /** 0 = dia, 1 = noite. */
  night: { value: number };
  time: { value: number };
  dither: { value: number };
}

export function createTextureArray(data: Uint8Array): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(data, LAYER_SIZE, LAYER_SIZE, LAYER_NAMES.length);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.NearestFilter;
  // Mipmaps "nearest" mantêm o visual pixelado de perto e evitam o chuvisco ao longe.
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createWorldUniforms(map: THREE.DataArrayTexture): WorldUniforms {
  return {
    map: { value: map },
    fogColor: { value: new THREE.Color('#b7cfe0') },
    fogNear: { value: 140 },
    fogFar: { value: 440 },
    snapRes: { value: new THREE.Vector2(160, 120) },
    affine: { value: 1 },
    night: { value: 0 },
    time: { value: 0 },
    dither: { value: 1 },
  };
}

const COMMON_FRAG = /* glsl */ `
  precision highp float;
  precision highp sampler2DArray;
  uniform sampler2DArray map;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float night;
  uniform float time;
  uniform float dither;
  in vec3 vUvW;
  in float vLayer;
  in vec3 vTint;
  in float vShade;
  in float vFogDepth;
  in vec3 vWorld;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

  vec3 ps1Dither(vec3 c) {
    if (dither < 0.5) return c;
    ivec2 p = ivec2(gl_FragCoord.xy) & 3;
    float b = BAYER[p.y * 4 + p.x] / 16.0 - 0.5;
    return floor(clamp(c + b / 31.0, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  }

  vec4 shadeTexel(vec2 uv) {
    float layer = floor(vLayer + 0.5);
    if (abs(layer - ${LAYER.water.toFixed(1)}) < 0.5) uv += vec2(time * 0.015, time * 0.008);
    vec4 tex = texture(map, vec3(uv, layer));
    if (tex.a < 0.3) discard;
    bool tinted = tex.a > 0.9;
    bool glow = tex.a < 0.7;
    vec3 base = tinted ? tex.rgb * vTint * 2.0 : tex.rgb;
    vec3 col = base * vShade;
    if (night > 0.0) {
      vec3 moon = col * vec3(0.24, 0.27, 0.42);
      vec3 lit = moon;
      if (glow) {
        float on = step(0.42, hash12(floor(vWorld.xz / 3.2) + floor(vWorld.y / 3.2) * 17.0));
        lit = mix(moon, tex.rgb * vec3(1.35, 1.2, 0.85) + vec3(0.18, 0.14, 0.04), on);
      }
      col = mix(col, lit, night);
    }
    float fog = smoothstep(fogNear, fogFar, vFogDepth);
    return vec4(mix(col, fogColor, fog), 1.0);
  }
`;

const WORLD_VERT = /* glsl */ `
  precision highp float;
  in float layer;
  in vec3 tint;
  in float shade;
  uniform vec2 snapRes;
  uniform float affine;
  out vec3 vUvW;
  out float vLayer;
  out vec3 vTint;
  out float vShade;
  out float vFogDepth;
  out vec3 vWorld;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * world;
    vec4 clip = projectionMatrix * mv;
    if (snapRes.x > 0.0 && clip.w > 0.0) {
      vec2 ndc = clip.xy / clip.w;
      ndc = floor(ndc * snapRes + 0.5) / snapRes;
      clip.xy = ndc * clip.w;
    }
    gl_Position = clip;
    float w = mix(1.0, max(clip.w, 0.001), affine);
    vUvW = vec3(uv * w, w);
    vLayer = layer;
    vTint = tint;
    vShade = shade;
    vFogDepth = -mv.z;
    vWorld = world.xyz;
  }
`;

const WORLD_FRAG = /* glsl */ `
  ${COMMON_FRAG}
  void main() {
    vec4 c = shadeTexel(vUvW.xy / vUvW.z);
    gl_FragColor = vec4(ps1Dither(c.rgb), 1.0);
  }
`;

/** Billboards cilíndricos (vegetação): o quad gira em torno do eixo vertical para olhar a câmera. */
const TREE_VERT = /* glsl */ `
  precision highp float;
  in vec3 center;
  in vec2 corner;
  in float layer;
  uniform vec2 snapRes;
  uniform float affine;
  out vec3 vUvW;
  out float vLayer;
  out vec3 vTint;
  out float vShade;
  out float vFogDepth;
  out vec3 vWorld;

  void main() {
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 right = normalize(vec3(camRight.x, 0.0, camRight.z));
    vec3 world = center + right * corner.x + vec3(0.0, corner.y, 0.0);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vec4 clip = projectionMatrix * mv;
    if (snapRes.x > 0.0 && clip.w > 0.0) {
      vec2 ndc = clip.xy / clip.w;
      ndc = floor(ndc * snapRes + 0.5) / snapRes;
      clip.xy = ndc * clip.w;
    }
    gl_Position = clip;
    float w = mix(1.0, max(clip.w, 0.001), affine);
    vUvW = vec3(uv * w, w);
    vLayer = layer;
    vTint = vec3(0.5);
    vShade = 1.0;
    vFogDepth = -mv.z;
    vWorld = world;
  }
`;

export function createWorldMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: WORLD_VERT,
    fragmentShader: WORLD_FRAG,
    side: THREE.FrontSide,
  });
}

export function createTreeMaterial(uniforms: WorldUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: TREE_VERT,
    fragmentShader: WORLD_FRAG,
    side: THREE.DoubleSide,
  });
}
