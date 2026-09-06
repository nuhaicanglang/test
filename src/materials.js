import * as THREE from "three";
import { QUALITY, normalizeQuality } from "./quality.js";

const surfaces = new Map();
const origin = { value: new THREE.Vector3() };
const atmosphere = { value: new THREE.Color(0.64, 0.74, 0.83) };
const duskAmount = { value: 0 };
const fogDensity = { value: 0.0015 };
const terrainRock = { value: null },
  terrainRockNormal = { value: null };
const materialType = (name) =>
  /snow|mountain|stone|bark|wood|jacket|foliage/.test(name)
    ? name === "mountain" || name === "stone"
      ? "rock"
      : /snow/.test(name)
        ? "snow"
        : /jacket/.test(name)
          ? "fabric"
          : /foliage/.test(name)
            ? "pine"
            : /bark/.test(name)
              ? "bark"
              : "wood"
    : null;

export function makeSurface(name, color, extras = {}) {
  const physical = /glass|ski-coat|metal/.test(name);
  const Constructor = physical
    ? THREE.MeshPhysicalMaterial
    : THREE.MeshStandardMaterial;
  const mat = new Constructor({
    color,
    roughness: 0.72,
    metalness: 0,
    ...extras,
  });
  mat.name = name;
  mat.userData.surface = materialType(name);
  mat.userData.baseColor = mat.color.clone();
  mat.userData.sharedModelResource = true;
  surfaces.set(name, mat);
  installSurfaceShader(mat);
  return mat;
}

function installSurfaceShader(mat) {
  const kind = mat.userData.surface;
  mat.userData.surfaceCompile = (shader) => {
    shader.uniforms.alpineOrigin = origin;
    shader.uniforms.alpineFog = atmosphere;
    shader.uniforms.alpineDusk = duskAmount;
    shader.uniforms.alpineDensity = fogDensity;
    shader.uniforms.terrainRock = terrainRock;
    shader.uniforms.terrainRockNormal = terrainRockNormal;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 vAlpineWorld; varying vec3 vAlpineNormal; uniform vec3 alpineOrigin;`,
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vec4 alpineLocal = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          alpineLocal = instanceMatrix * alpineLocal;
        #endif
        vAlpineWorld = (modelMatrix * alpineLocal).xyz + alpineOrigin;
        vAlpineNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vAlpineWorld; varying vec3 vAlpineNormal;
      uniform vec3 alpineFog; uniform float alpineDusk; uniform float alpineDensity;
      uniform sampler2D terrainRock; uniform sampler2D terrainRockNormal;
      vec4 alpineTri(sampler2D tex, vec3 p, vec3 n) {
        vec3 w = pow(abs(n), vec3(5.0)); w /= max(dot(w, vec3(1.0)), 0.001);
        return texture2D(tex,p.yz)*w.x + texture2D(tex,p.xz)*w.y + texture2D(tex,p.xy)*w.z;
      }`,
    );
    if (kind === "snow" || kind === "rock") {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
          vec3 p = vAlpineWorld * ${kind === "snow" ? "0.31" : "0.09"};
          vec3 detail = alpineTri(map, p, vAlpineNormal).rgb;
          vec3 broad = alpineTri(map, p * 0.137 + 0.31, vAlpineNormal).rgb;
          ${
            kind === "snow"
              ? "diffuseColor.rgb *= mix(vec3(0.88),detail,0.24) * mix(vec3(1.0),broad,0.10);" +
                (mat.name === "snow-track"
                  ? "float exposed=1.-smoothstep(.65,.82,vAlpineNormal.y);diffuseColor.rgb=mix(diffuseColor.rgb,alpineTri(terrainRock,vAlpineWorld*.09,vAlpineNormal).rgb*.67,exposed);"
                  : "")
              : `
            float cover = smoothstep(0.69,0.91,vAlpineNormal.y + sin(vAlpineWorld.x*0.13+vAlpineWorld.z*0.19)*0.075);
            diffuseColor.rgb = mix(detail * 0.76, vec3(0.81,0.87,0.91), cover);`
          }
        #endif`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `
        #ifdef USE_NORMALMAP
          vec3 nSample = alpineTri(normalMap, vAlpineWorld*${kind === "snow" ? "0.65" : "0.1"}, vAlpineNormal).xyz * 2.0 - 1.0;
          vec3 perturb = vec3(nSample.x,0.0,nSample.y);
          ${mat.name === "snow-track" ? "vec3 rn=alpineTri(terrainRockNormal,vAlpineWorld*.1,vAlpineNormal).xyz*2.-1.;perturb=mix(perturb,vec3(rn.x,0.,rn.y)*1.8,1.-smoothstep(.65,.82,vAlpineNormal.y));" : ""}
          normal = normalize(normal + mat3(viewMatrix)*perturb*${kind === "snow" ? "0.16" : "0.36"});
        #endif`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          roughnessFactor *= clamp(alpineTri(roughnessMap,vAlpineWorld*0.31,vAlpineNormal).g,0.6,1.0);
        #endif
        ${
          mat.name === "snow-track"
            ? `#ifdef USE_COLOR
          roughnessFactor=mix(roughnessFactor,.22,smoothstep(.14,.25,vColor.b-vColor.r));
        #endif`
            : ""
        }`,
      );
      // AO stays subtle in snow, rather than baking dark blobs into a bright slope.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <aomap_fragment>",
        `
        #ifdef USE_AOMAP
          float alpineAO = mix(1.0,alpineTri(aoMap,vAlpineWorld*0.31,vAlpineNormal).r,0.18);
          reflectedLight.indirectDiffuse *= alpineAO;
        #endif`,
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      `
      #ifdef USE_FOG
        float alpineDepth = vFogDepth;
        float alpineFogFactor = 1.0-exp(-alpineDepth*alpineDensity);
        gl_FragColor.rgb = mix(gl_FragColor.rgb,alpineFog,clamp(alpineFogFactor,0.0,0.92));
      #endif`,
    );
    mat.userData.shader = shader;
  };
  mat.onBeforeCompile = mat.userData.surfaceCompile;
  mat.customProgramCacheKey = () =>
    `alpine-v3-${kind}-${mat.userData.cascades || 0}`;
}

export function composeShadowShader(mat, csm) {
  if (!mat.isMeshStandardMaterial) return;
  // CSM.dispose removes uniforms from its compiled shader objects. Release the
  // renderer's material-program cache before reusing this material with a new
  // CSM instance, or a cached program can retain deleted uniform descriptors.
  mat.dispose();
  mat.onBeforeCompile = mat.userData.surfaceCompile || (() => {});
  if (csm) {
    csm.setupMaterial(mat);
    const shadows = mat.onBeforeCompile;
    mat.onBeforeCompile = function (shader, renderer) {
      shadows.call(this, shader, renderer);
      this.userData.surfaceCompile?.(shader, renderer);
    };
  } else if (mat.defines) {
    delete mat.defines.USE_CSM;
    delete mat.defines.CSM_CASCADES;
    delete mat.defines.CSM_FADE;
  }
  mat.userData.cascades = csm?.cascades || 0;
  mat.needsUpdate = true;
}

export function updateMaterialWorld(distance, base, fog, dusk) {
  origin.value.set(0, base, -distance);
  atmosphere.value.copy(fog);
  duskAmount.value = dusk;
}
export function updateMaterialOrigin(position, fog, dusk, density) {
  origin.value.copy(position);
  atmosphere.value.copy(fog);
  duskAmount.value = dusk;
  fogDensity.value = density;
}
export function allSurfaces() {
  return [...surfaces.values()];
}

export class MaterialLibrary {
  constructor(renderer, report = () => {}, loader = new THREE.TextureLoader()) {
    this.renderer = renderer;
    this.report = report;
    this.loader = loader;
    this.generation = 0;
    this.textures = new Map();
    this.ready = false;
    this.disposed = false;
  }
  async load(quality) {
    const version = ++this.generation;
    const preset = QUALITY[normalizeQuality(quality)];
    const candidates = new Map();
    let completed = 0;
    const jobs = ["snow", "rock", "bark", "wood", "fabric", "pine"].flatMap(
      (name) =>
        (name === "fabric"
          ? ["normal", "arm"]
          : name === "pine"
            ? ["color", "normal", "arm", "alpha"]
            : ["color", "normal", "arm"]
        ).map((channel) => ({ name, channel })),
    );
    this.report({ ready: false, progress: 0 });
    const results = await Promise.allSettled(
      jobs.map(async ({ name, channel }) => {
        const size = ["snow", "rock"].includes(name)
          ? preset.texture
          : preset.detail;
        const texture = await this.loader.loadAsync(
          `/materials/${name}-${channel}-${size}.webp`,
        );
        texture.colorSpace =
          channel === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(
          8,
          this.renderer.capabilities.getMaxAnisotropy(),
        );
        candidates.set(`${name}/${channel}`, texture);
        completed++;
        if (version === this.generation)
          this.report({ ready: false, progress: completed / jobs.length });
      }),
    );
    if (version !== this.generation || this.disposed) {
      candidates.forEach((t) => t.dispose());
      return false;
    }
    const required =
      !candidates.has("snow/color") ||
      !candidates.has("snow/normal") ||
      !candidates.has("rock/color");
    if (required) {
      candidates.forEach((t) => t.dispose());
      this.report({
        ready: this.ready,
        progress: 1,
        error: "雪道材质加载失败，请重试",
        retry: true,
      });
      return false;
    }
    const previous = this.textures;
    this.textures = candidates;
    terrainRock.value = candidates.get("rock/color");
    terrainRockNormal.value =
      candidates.get("rock/normal") || candidates.get("snow/normal");
    for (const mat of surfaces.values()) {
      const name = mat.userData.surface;
      if (!name) continue;
      mat.map = candidates.get(`${name}/color`) || null;
      mat.normalMap = candidates.get(`${name}/normal`) || null;
      mat.roughnessMap = mat.aoMap = candidates.get(`${name}/arm`) || null;
      mat.aoMapIntensity = 0.35;
      mat.normalScale.setScalar(
        name === "fabric" ? 0.18 : name === "snow" ? 0.2 : 0.65,
      );
      if (name === "pine") {
        mat.alphaMap = candidates.get("pine/alpha") || null;
        mat.alphaTest = 0.42;
        mat.side = THREE.DoubleSide;
      }
      if (["bark", "wood", "pine"].includes(name))
        mat.color.setScalar(name === "pine" ? 0.72 : 0.85);
      if (name === "fabric") {
        mat.normalMap?.repeat.set(5, 5);
        mat.roughnessMap?.repeat.set(5, 5);
      }
      mat.needsUpdate = true;
    }
    previous.forEach((t) => t.dispose());
    this.ready = true;
    this.report({
      ready: true,
      progress: 1,
      warning: results.some((r) => r.status === "rejected")
        ? "部分装饰材质使用备用表面"
        : null,
    });
    return true;
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
  }
}
