// SUNPORT v3 — full day/night cycle: sun + moon, sky colour, fog, stars.
// t is the day fraction: 0.00 midnight, 0.25 sunrise, 0.50 noon, 0.75 sunset.
// A full day lasts 240 s of sim time, so the golden hour and the neon night
// both show up inside one play session.
import * as THREE from 'three';

const DAY_LENGTH = 240;

const SKY_NIGHT = new THREE.Color(0x0a1030);
const SKY_DAWN = new THREE.Color(0xff9a5c);
const SKY_DAY = new THREE.Color(0x87bfe8);
const SKY_DUSK = new THREE.Color(0xff7a4d);

export class DayNight {
  constructor(G) {
    this.G = G;
    this.t = 0.72; // late afternoon: golden hour is about to start
    this.nightF = 0; // 0 = full day, 1 = full night
    this.sun = new THREE.DirectionalLight(0xffd9a0, 2.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -160;
    this.sun.shadow.camera.right = 160;
    this.sun.shadow.camera.top = 160;
    this.sun.shadow.camera.bottom = -160;
    this.sun.shadow.camera.far = 700;
    this.sun.shadow.bias = -0.0004;
    G.scene.add(this.sun);
    G.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a6f4d, 0.9);
    G.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x404060, 0.35);
    G.scene.add(this.ambient);
    // Sun + moon billboards.
    this.sunSprite = this.makeGlowSprite(0xffd27a, 42);
    this.moonSprite = this.makeGlowSprite(0xdfe8ff, 26);
    G.scene.add(this.sunSprite);
    G.scene.add(this.moonSprite);
    // Stars (visible at night only).
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.45 + 0.08;
      const r = 480;
      starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      starPos[i * 3 + 1] = Math.sin(e) * r;
      starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      transparent: true,
      opacity: 0,
      sizeAttenuation: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    G.scene.add(this.stars);
    this.sky = new THREE.Color();
    this.fog = new THREE.Fog(0x87bfe8, 120, 520);
    G.scene.fog = this.fog;
  }

  makeGlowSprite(color, size) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const spr = new THREE.Sprite(mat);
    spr.scale.setScalar(size);
    return spr;
  }

  setTime(t) {
    this.t = ((t % 1) + 1) % 1;
    this.apply(0);
  }

  update(dt) {
    this.t = (this.t + dt / DAY_LENGTH) % 1;
    this.apply(dt);
  }

  apply() {
    const t = this.t;
    // Sun elevation: 0 at sunrise/sunset, +1 at noon, -1 at midnight.
    const elev = Math.sin((t - 0.25) * Math.PI * 2);
    const az = (t - 0.25) * Math.PI * 2;
    const el = Math.max(-1, Math.min(1, elev));
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(Math.asin(el)), el, Math.sin(az) * 0.6);
    this.sun.position.copy(dir).multiplyScalar(320);
    this.sun.target.position.set(0, 0, 0);
    // Day factor: 1 at noon, 0 at night, smooth at the edges.
    const dayF = THREE.MathUtils.clamp((el + 0.12) / 0.5, 0, 1);
    this.nightF = 1 - dayF;
    const warm = THREE.MathUtils.clamp(1 - Math.abs(el) * 2.2, 0, 1);
    const sunColor = new THREE.Color(0xfff2d8).lerp(new THREE.Color(0xff8a3c), warm);
    this.sun.color.copy(sunColor);
    this.sun.intensity = 0.12 + dayF * 2.1;
    this.hemi.intensity = 0.25 + dayF * 0.7;
    this.ambient.intensity = 0.18 + dayF * 0.22;
    // Sky colour: night -> dawn -> day -> dusk -> night.
    if (t < 0.22 || t >= 0.78) {
      this.sky.copy(SKY_NIGHT);
    } else if (t < 0.3) {
      this.sky.copy(SKY_NIGHT).lerp(SKY_DAWN, (t - 0.22) / 0.08);
    } else if (t < 0.42) {
      this.sky.copy(SKY_DAWN).lerp(SKY_DAY, (t - 0.3) / 0.12);
    } else if (t < 0.66) {
      this.sky.copy(SKY_DAY);
    } else if (t < 0.78) {
      this.sky.copy(SKY_DAY).lerp(SKY_DUSK, (t - 0.66) / 0.12);
    }
    this.G.scene.background = this.sky;
    this.fog.color.copy(this.sky);
    this.fog.near = 140 - this.nightF * 40;
    this.fog.far = 560 - this.nightF * 120;
    // Sun / moon / stars follow the same clock.
    this.sunSprite.position.copy(dir).multiplyScalar(460);
    this.sunSprite.material.opacity = dayF > 0.02 ? 0.95 : 0;
    const moonDir = dir.clone().multiplyScalar(-1);
    this.moonSprite.position.copy(moonDir).multiplyScalar(460);
    this.moonSprite.material.opacity = this.nightF > 0.05 ? 0.9 : 0;
    this.starMat.opacity = this.nightF * 0.9;
  }

  get isNight() {
    return this.nightF > 0.55;
  }

  // Human label for the HUD district line, e.g. "Golden Hour" / "Night".
  get timeLabel() {
    if (this.nightF > 0.8) return 'Night';
    if (this.t > 0.66 && this.t < 0.78) return 'Golden Hour';
    if (this.t < 0.3) return 'Dawn';
    return 'Day';
  }
}
