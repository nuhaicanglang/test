import * as THREE from "three";
import { CSM } from "three/addons/csm/CSM.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import {
  allSurfaces,
  composeShadowShader,
  updateMaterialWorld,
  updateMaterialOrigin,
} from "./materials.js";

export class AlpineEnvironment {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.sunDirection = new THREE.Vector3(-0.67, 0.42, -0.35).normalize();
    this.fogColor = new THREE.Color("#adc7d9");
    this.fill = new THREE.HemisphereLight(0xc4deff, 0x758da5, 1.0);
    scene.add(this.fill);
    this.sun = new THREE.DirectionalLight(0xffe1bb, 3.4);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(4200, 40, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          sunDirection: { value: this.sunDirection },
          dusk: { value: 0 },
          time: { value: 0 },
          daylight: { value: 1 },
          cloudCover: { value: 0.1 },
        },
        vertexShader: `varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform vec3 sunDirection;uniform float dusk;uniform float time;uniform float daylight;uniform float cloudCover;varying vec3 vDirection;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){return noise(p)*.55+noise(p*2.03)*.27+noise(p*4.07)*.13+noise(p*8.11)*.05;}
      void main(){vec3 d=normalize(vDirection);float h=max(d.y,0.);float s=max(dot(d,sunDirection),0.);
        vec3 zenith=mix(vec3(.035,.12,.26),vec3(.10,.11,.24),dusk);
        vec3 horizon=mix(vec3(.38,.60,.80),vec3(.67,.43,.40),dusk);
        vec3 color=mix(horizon,zenith,pow(h,.55));color+=vec3(1.,.57,.22)*pow(s,14.)*(.14+dusk*.1);
        color=mix(vec3(.009,.02,.047)+vec3(.017,.033,.053)*(1.-h),color,daylight);
        color+=mix(vec3(.58,.72,1.),vec3(1.,.81,.55),daylight)*smoothstep(.99978,.99993,s)*mix(.8,8.,daylight);
        vec2 p=d.xz/max(d.y+.12,.07)*2.6+vec2(time*.001,0.);
        float cloud=smoothstep(.64-cloudCover*.35,.84-cloudCover*.3,fbm(p+fbm(p*.4)))*smoothstep(.01,.14,d.y);
        color=mix(color,mix(vec3(.035,.05,.082),mix(vec3(.60,.67,.73),vec3(.66,.50,.5),dusk),daylight),cloud*(.4+cloudCover*.5));
        float star=pow(hash(floor(d.xz/max(.06,d.y)*1200.)),190.);color+=star*(1.-daylight)*(1.-cloud)*smoothstep(.1,.5,h)*.65;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      }),
    );
    this.sky.renderOrder = -100;
    scene.add(this.sky);
    scene.fog = new THREE.Fog(this.fogColor, 80, 850);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // A local, non-network fallback keeps metal and glass readable if HDR is unavailable.
    const fallback = new THREE.Scene();
    fallback.background = new THREE.Color("#b0c6d9");
    this.fallback = this.pmrem.fromScene(fallback, 0.1, 0.1, 10, 64);
    scene.environment = this.fallback.texture;
    this.environmentPromise = new RGBELoader()
      .loadAsync("/materials/winter-environment-2k.hdr")
      .then((texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        this.hdr = this.pmrem.fromEquirectangular(texture);
        texture.dispose();
        scene.environment = this.hdr.texture;
      })
      .catch(() => {
        this.hdrFailed = true;
      });
    scene.environmentIntensity = 0.4;
    scene.environmentRotation.y = -1.2;
    this.headlamp = new THREE.SpotLight(0xc7e8ff, 0, 70, 0.48, 0.7, 1.6);
    this.headlamp.castShadow = false;
    scene.add(this.headlamp, this.headlamp.target);
    const nightScene = new THREE.Scene();
    nightScene.background = new THREE.Color("#1c3558");
    this.nightEnvironment = this.pmrem.fromScene(nightScene, 0.1, 0.1, 10, 64);
  }
  setQuality(quality) {
    if (this.csm) {
      this.csm.lights.forEach((light) => light.shadow.map?.dispose());
      this.csm.remove();
      this.csm.dispose();
      this.csm = undefined;
    }
    this.sun.castShadow = false;
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.quality = quality;
    if (quality === "ultra") {
      this.csm = new CSM({
        camera: this.camera,
        parent: this.scene,
        cascades: 3,
        maxFar: 230,
        mode: "practical",
        shadowMapSize: 2048,
        lightDirection: this.sunDirection.clone().negate(),
        lightIntensity: 3.4,
        lightNear: 1,
        lightFar: 500,
        shadowBias: -0.0001,
      });
      this.csm.fade = true;
      this.sun.intensity = 0;
      this.csm.lights.forEach((light) => {
        light.shadow.normalBias = 0.08;
        light.color.set("#ffe1bb");
      });
    } else if (quality === "high") {
      this.sun.intensity = 3.4;
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      Object.assign(this.sun.shadow.camera, {
        left: -48,
        right: 48,
        top: 70,
        bottom: -40,
        near: 1,
        far: 300,
      });
      this.sun.shadow.camera.updateProjectionMatrix();
      this.sun.shadow.bias = -0.0002;
      this.sun.shadow.normalBias = 0.07;
    } else this.sun.intensity = 3.4;
    allSurfaces().forEach((mat) => composeShadowShader(mat, this.csm));
  }
  update(distance, base, time, menu) {
    const dusk =
      THREE.MathUtils.smoothstep(distance % 4500, 1500, 2500) *
      (1 - THREE.MathUtils.smoothstep(distance % 4500, 3500, 4500));
    this.dusk = dusk;
    this.sky.position.copy(this.camera.position);
    this.sky.material.uniforms.dusk.value = dusk;
    this.sky.material.uniforms.time.value = time;
    this.fogColor.set("#adc7d9").lerp(new THREE.Color("#ac9aaa"), dusk);
    this.scene.fog.color.copy(this.fogColor);
    this.sun.color.set("#ffe1bb").lerp(new THREE.Color("#ffaf77"), dusk);
    this.fill.color.set("#c4deff").lerp(new THREE.Color("#b3b8e3"), dusk);
    this.fill.intensity = THREE.MathUtils.lerp(0.95, 0.65, dusk);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.42, 0.26, dusk);
    allSurfaces().forEach((mat) => {
      if (mat.name === "window-glow") mat.emissiveIntensity = 0.25 + dusk * 1.6;
    });
    const anchor = menu
      ? new THREE.Vector3(0, 0, -20)
      : new THREE.Vector3(
          this.camera.position.x * 0.5,
          this.camera.position.y * 0.6,
          -30,
        );
    this.sun.target.position.copy(anchor);
    this.sun.position.copy(anchor).addScaledVector(this.sunDirection, 130);
    if (this.csm) {
      this.csm.lights.forEach((light) => light.color.copy(this.sun.color));
      if (Math.abs((this.lastFov || 0) - this.camera.fov) > 0.1) {
        this.csm.updateFrustums();
        this.lastFov = this.camera.fov;
      }
      this.csm.update();
    }
    updateMaterialWorld(distance, base, this.fogColor, dusk);
  }
  updateOpen(env, origin, time, player, heading) {
    const day = env.daylight,
      night = 1 - day,
      alt = env.sunAltitude;
    const dusk = Math.max(0, 1 - Math.abs(alt) / 0.45) * day;
    const az = ((env.hour - 6) / 24) * Math.PI * 2;
    this.sunDirection
      .set(
        Math.cos(az) * 0.78,
        Math.max(0.12, Math.abs(alt)),
        Math.sin(az) * 0.62,
      )
      .normalize();
    this.sky.position.copy(this.camera.position);
    const u = this.sky.material.uniforms;
    u.daylight.value = day;
    u.dusk.value = dusk * 0.55;
    u.time.value = time;
    u.cloudCover.value = env.cloud;
    this.fogColor
      .set("#aac9dc")
      .lerp(new THREE.Color("#b8a0a6"), dusk * 0.65)
      .lerp(new THREE.Color("#13283f"), night);
    this.scene.fog.color.copy(this.fogColor);
    this.sun.color
      .set("#fff0d3")
      .lerp(new THREE.Color("#ffb878"), dusk)
      .lerp(new THREE.Color("#9bbce6"), night);
    const intensity = (0.4 + day * 3.1) * (1 - env.cloud * 0.65);
    this.sun.intensity = this.csm ? 0 : intensity;
    this.fill.color.set("#bddcff").lerp(new THREE.Color("#718db6"), night);
    this.fill.intensity = 0.3 + day * 0.66;
    this.scene.environment =
      day < 0.08
        ? this.nightEnvironment.texture
        : this.hdr?.texture || this.fallback.texture;
    this.scene.environmentIntensity = 0.2 + day * 0.22;
    this.scene.environmentRotation.y = az - 1.2;
    this.renderer.toneMappingExposure = 1.02 - day * 0.06;
    for (const mat of allSurfaces())
      if (mat.name === "window-glow")
        mat.emissiveIntensity = 0.2 + night * 3 + dusk;
    const anchor = player.clone();
    this.sun.target.position.copy(anchor);
    this.sun.position.copy(anchor).addScaledVector(this.sunDirection, 160);
    this.headlamp.position.copy(player).add(new THREE.Vector3(0, 1.65, 0));
    this.headlamp.target.position
      .copy(player)
      .add(
        new THREE.Vector3(Math.sin(heading) * 25, -3, -Math.cos(heading) * 25),
      );
    this.headlamp.intensity = night * 48 + env.fog * 5;
    if (this.csm) {
      this.csm.lightDirection.copy(this.sunDirection).negate();
      this.csm.lights.forEach((l) => {
        l.color.copy(this.sun.color);
        l.intensity = intensity;
      });
      if (
        Math.abs((this.lastFov || 0) - this.camera.fov) > 0.1 ||
        this.lastAspect !== this.camera.aspect
      ) {
        this.csm.updateFrustums();
        this.lastFov = this.camera.fov;
        this.lastAspect = this.camera.aspect;
      }
      this.csm.update();
    }
    this.shaftStrength = day * (1 - env.cloud) * 0.24;
    updateMaterialOrigin(
      origin,
      this.fogColor,
      dusk,
      0.00075 + env.fog * 0.007,
    );
  }
  dispose() {
    this.disposed = true;
    this.csm?.lights.forEach((light) => light.shadow.map?.dispose());
    this.csm?.remove();
    this.csm?.dispose();
    this.hdr?.dispose();
    this.fallback.dispose();
    this.nightEnvironment.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sun.shadow.map?.dispose();
    this.scene.remove(this.sun, this.sun.target, this.fill, this.sky);
    this.scene.remove(this.headlamp, this.headlamp.target);
  }
}
