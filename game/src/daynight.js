// SUNPORT v2 — day/night cycle and the ambient life of the city. The sun,
// sky, fog, windows, neon, streetlights and the lighthouse all follow one
// cycle; clouds drift, palms sway, foam slides and yachts bob here too,
// so the world never stands still.

import * as THREE from 'three';
import { clamp, lerp } from './config.js';

const CYCLE_LEN = 240; // seconds for a full day

// Keyframes across the cycle: dawn, midday, golden hour, dusk, night.
const KEYS = [
  { t: 0.00, sun: 0.12, sunColor: 0xff9a52, sunI: 1.4, sky: 0xffb36b, fog: 0xe8a06a, hemi: 0.55, win: 0.25, neon: 0.25, exp: 1.05 },
  { t: 0.22, sun: 0.95, sunColor: 0xfff2d8, sunI: 2.4, sky: 0x87c5eb, fog: 0x9fc4de, hemi: 0.9, win: 0.0, neon: 0.0, exp: 1.0 },
  { t: 0.42, sun: 0.2, sunColor: 0xffb36b, sunI: 1.7, sky: 0xff9e66, fog: 0xd88a5e, hemi: 0.6, win: 0.35, neon: 0.35, exp: 1.08 },
  { t: 0.52, sun: -0.06, sunColor: 0xff7a4d, sunI: 0.7, sky: 0x4a3a63, fog: 0x5a4a6a, hemi: 0.4, win: 0.7, neon: 0.8, exp: 1.0 },
  { t: 0.62, sun: -0.4, sunColor: 0x8a9ac0, sunI: 0.25, sky: 0x0a1424, fog: 0x0e1a2c, hemi: 0.22, win: 0.95, neon: 1.0, exp: 0.95 },
  { t: 0.92, sun: -0.3, sunColor: 0x8a9ac0, sunI: 0.25, sky: 0x0a1424, fog: 0x0e1a2c, hemi: 0.22, win: 0.95, neon: 1.0, exp: 0.95 },
  { t: 1.00, sun: 0.12, sunColor: 0xff9a52, sunI: 1.4, sky: 0xffb36b, fog: 0xe8a06a, hemi: 0.55, win: 0.25, neon: 0.25, exp: 1.05 },
];

function sampleKeys(t) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (t >= KEYS[i].t && t <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  const mix = (pa, pb) => lerp(pa, pb, f);
  return {
    sun: mix(a.sun, b.sun),
    sunColor: new THREE.Color(a.sunColor).lerp(new THREE.Color(b.sunColor), f),
    sunI: mix(a.sunI, b.sunI),
    sky: new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), f),
    fog: new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), f),
    hemi: mix(a.hemi, b.hemi),
    win: mix(a.win, b.win),
    neon: mix(a.neon, b.neon),
    exp: mix(a.exp, b.exp),
  };
}

export class DayNight {
  constructor(scene, city, renderer) {
    this.scene = scene;
    this.city = city;
    this.renderer = renderer;
    this.t = 0.06; // start just after dawn — golden morning light
    this.sun = new THREE.DirectionalLight(0xff9a52, 1.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -180; sc.right = 180; sc.top = 180; sc.bottom = -180;
    sc.near = 10; sc.far = 700;
    this.sun.shadow.bias = -0.0006;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a5a3a, 0.6);
    scene.add(this.hemi);
    // Moon + stars for the night.
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(6, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xf2f0dc }),
    );
    this.moon.visible = false;
    scene.add(this.moon);
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 320; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.45 + 0.08;
      const r = 420;
      starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, transparent: true, opacity: 0, sizeAttenuation: false,
    }));
    scene.add(this.stars);
    this.nightF = 0; // 0 = day, 1 = full night
    this.apply(0);
  }

  setTime(t) {
    this.t = ((t % 1) + 1) % 1;
    this.apply(0);
  }

  get isNight() {
    return this.nightF > 0.55;
  }

  // phaseName is shown nowhere in the HUD; it is for shots and debugging.
  phaseName() {
    if (this.t < 0.12) return 'dawn';
    if (this.t < 0.32) return 'day';
    if (this.t < 0.48) return 'golden';
    if (this.t < 0.58) return 'dusk';
    return 'night';
  }

  apply(dt) {
    const k = sampleKeys(this.t);
    // Sun circles the sky: east in the morning, west at golden hour.
    const az = lerp(-Math.PI * 0.35, Math.PI * 1.15, this.t);
    const el = Math.max(-0.25, k.sun);
    this.sun.position.set(Math.cos(az) * 260, el * 320 + 20, Math.sin(az) * 200 - 40);
    this.sun.color.copy(k.sunColor);
    this.sun.intensity = k.sunI;
    this.hemi.intensity = k.hemi;
    this.scene.background = k.sky;
    if (this.scene.fog) {
      this.scene.fog.color.copy(k.fog);
      this.scene.fog.near = 90;
      this.scene.fog.far = 420;
    }
    this.renderer.toneMappingExposure = k.exp;
    // Night factor: 1 when the sun is well below the horizon.
    const target = clamp((0.02 - k.sun) / 0.25, 0, 1);
    this.nightF = lerp(this.nightF, target, dt > 0 ? Math.min(1, dt * 2) : 1);
    const n = this.nightF;
    // Windows glow at night; neon and streetlights come on.
    for (const m of this.city.windowMats) m.emissiveIntensity = k.win;
    for (const s of this.city.neons) {
      let glow = k.neon * s.base;
      if (s.flicker && Math.random() < 0.06) glow *= 0.15;
      if (s.glowMat) s.glowMat.opacity = glow;
      if (s.mat) s.mat.color.setScalar(0.35 + 0.65 * k.neon);
    }
    for (const p of this.city.streetPools) p.opacity = 0.32 * n;
    // Moon opposite the sun, stars fade in.
    this.moon.visible = n > 0.15;
    this.moon.position.set(-this.sun.position.x * 1.4, 190, -this.sun.position.z * 1.4);
    this.stars.material.opacity = 0.85 * n;
    // Lighthouse beam spins at night.
    if (this.city.lighthouseBeam) {
      this.city.lighthouseBeam.material.opacity = 0.5 * n;
      this.city.lighthouseBeam.rotation.y += dt * 0.9;
    }
  }

  update(dt, simTime) {
    this.t = (this.t + dt / CYCLE_LEN) % 1;
    this.apply(dt);
    // --- Ambient motion: the world never stands still ----------------------
    // Clouds drift east and wrap around.
    for (const c of this.city.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 340) c.mesh.position.x = -260;
    }
    // Palms sway gently in the sea breeze.
    for (const p of this.city.palms) {
      const s = Math.sin(simTime * 1.1 + p.phase) * 0.06;
      p.crown.rotation.z = p.baseRot + s;
      p.crown.rotation.x = Math.cos(simTime * 0.9 + p.phase) * 0.04;
    }
    // Foam slides along the shoreline; the sea texture scrolls.
    for (const f of this.city.foam) {
      f.mesh.position.x = 227 + Math.sin(simTime * 0.5 + f.phase) * 1.2;
      f.mesh.material.opacity = 0.25 + 0.12 * Math.sin(simTime * 0.7 + f.phase);
    }
    if (this.city.seaMat) {
      this.city.seaMat.offset.y = (simTime * 0.008) % 1;
      this.city.seaMat.offset.x = (simTime * 0.004) % 1;
    }
    // Yachts bob on the swell.
    for (const y of this.city.yachts) {
      y.group.position.y = -0.2 + Math.sin(simTime * 0.8 + y.phase) * 0.18;
      y.group.rotation.z = Math.sin(simTime * 0.6 + y.phase) * 0.02;
    }
    // The flyover plane crosses the sky and loops.
    const pl = this.city.plane;
    if (pl) {
      pl.t += dt;
      const x = -260 + ((pl.t * 14) % 620);
      pl.group.position.set(x, 80 + Math.sin(pl.t * 0.4) * 3, -120 + Math.sin(pl.t * 0.2) * 20);
      pl.group.rotation.y = -Math.PI / 2;
    }
  }
}
