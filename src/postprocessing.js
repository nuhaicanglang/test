import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

const shaftShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    sunUV: { value: new THREE.Vector2() },
    strength: { value: 0 },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1500 },
  },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse;uniform sampler2D tDepth;uniform vec2 sunUV;uniform float strength;uniform float cameraNear;uniform float cameraFar;varying vec2 vUv;
    void main(){vec4 base=texture2D(tDiffuse,vUv);vec2 delta=(vUv-sunUV)/24.;vec2 p=vUv;float light=0.;float decay=1.;
      for(int i=0;i<24;i++){p-=delta;float z=texture2D(tDepth,clamp(p,0.,1.)).r;float sky=step(.99999,z);float radial=exp(-length(p-sunUV)*16.);light+=sky*radial*decay;decay*=.94;}
      float direct=step(.99999,texture2D(tDepth,clamp(sunUV,0.,1.)).r);
      gl_FragColor=vec4(base.rgb+vec3(1.,.72,.43)*light*strength*direct/24.,base.a);}`,
};

export class AlpinePost {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.width = 1;
    this.height = 1;
  }
  setQuality(quality) {
    this.release();
    this.quality = quality;
    if (quality === "low") return;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
    // Alpha-cut foliage and sky do not belong in the solid-surface AO prepass.
    // Otherwise the override normal material treats each needle card as a solid rectangle.
    const originalOverride = this.ao._overrideVisibility.bind(this.ao);
    const originalRestore = this.ao._restoreVisibility.bind(this.ao);
    this.ao._overrideVisibility = () => {
      originalOverride();
      this.aoCutouts = [];
      this.scene.traverse((object) => {
        if (
          object.visible &&
          (object.material?.alphaTest > 0 ||
            object.material?.transparent ||
            object.material?.side === THREE.BackSide)
        ) {
          this.aoCutouts.push(object);
          object.visible = false;
        }
      });
    };
    this.ao._restoreVisibility = () => {
      originalRestore();
      this.aoCutouts?.forEach((object) => {
        object.visible = true;
      });
    };
    this.ao.output = GTAOPass.OUTPUT.Default;
    this.ao.updateGtaoMaterial({
      radius: 1.1,
      distanceExponent: 1.5,
      thickness: 2,
      scale: 0.55,
      samples: quality === "ultra" ? 12 : 6,
    });
    this.composer.addPass(this.ao);
    if (quality === "ultra") {
      this.depthTarget = new THREE.WebGLRenderTarget(1, 1, {
        depthTexture: new THREE.DepthTexture(1, 1),
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
      this.shafts = new ShaderPass(shaftShader);
      this.composer.addPass(this.shafts);
      this.bokeh = new BokehPass(this.scene, this.camera, {
        focus: 35,
        aperture: 0.000008,
        maxblur: 0.0011,
      });
      this.composer.addPass(this.bokeh);
    }
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      quality === "ultra" ? 0.15 : 0.08,
      0.45,
      1.35,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    this.resize(this.width, this.height);
  }
  resize(w, h) {
    this.width = w;
    this.height = h;
    if (!this.composer) return;
    const ratio = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.ao.setSize(Math.ceil(w * ratio * 0.5), Math.ceil(h * ratio * 0.5));
    this.depthTarget?.setSize(
      Math.ceil(w * ratio * 0.25),
      Math.ceil(h * ratio * 0.25),
    );
    this.fxaa.uniforms.resolution.value.set(1 / (w * ratio), 1 / (h * ratio));
  }
  render(dt, menu, sunDirection, strength = 0.24) {
    if (!this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.bokeh) {
      this.bokeh.enabled = menu;
      this.bokeh.uniforms.focus.value = 38;
    }
    if (this.shafts) {
      const projected = this.camera.position
        .clone()
        .addScaledVector(sunDirection, 1000)
        .project(this.camera);
      const visible =
        strength > 0.01 &&
        projected.z < 1 &&
        Math.abs(projected.x) < 1.1 &&
        Math.abs(projected.y) < 1.1;
      this.shafts.enabled = visible;
      if (visible) {
        const saved = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.depthTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(saved);
        this.shafts.uniforms.tDepth.value = this.depthTarget.depthTexture;
        this.shafts.uniforms.sunUV.value.set(
          projected.x * 0.5 + 0.5,
          projected.y * 0.5 + 0.5,
        );
        this.shafts.uniforms.strength.value = strength;
      }
    }
    this.composer.render(dt);
  }
  release() {
    if (this.composer) {
      for (const pass of this.composer.passes) pass.dispose?.();
      this.composer.dispose();
    }
    this.depthTarget?.dispose();
    this.composer = null;
    this.depthTarget = null;
    this.ao = null;
    this.shafts = null;
    this.bokeh = null;
    this.bloom = null;
    this.fxaa = null;
  }
  dispose() {
    this.release();
  }
}
