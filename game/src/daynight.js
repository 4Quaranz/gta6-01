// SUNPORT — the day/night cycle and the glow registry.
// Golden hour is the default look; the clock drifts slowly (one game hour
// per minute of play) through dusk into a neon night and back to day.
// Every light, the sky, the fog and every emissive surface is lerped
// between keyframes, so the same city reads as a sun-soaked beach town by
// day and a pink-and-cyan neon strip by night. Modules that own glowing
// things (buildings, lamps, neon signs, car lights) register them here and
// this module drives their brightness from one nightFactor, 0..1.
import * as THREE from 'three';

// Keyframes: [hour, sunColor, sunIntensity, sunElevationDeg, sunAzimuthDeg,
//             hemiSky, hemiGround, hemiIntensity, skyColor, fogColor, fogNear, fogFar, night]
const KEYS = [
  [0, 0x8fa8d8, 0.45, 18, 200, 0x1a2340, 0x0c0f14, 0.6, 0x0b1026, 0x0b1026, 120, 340, 1.00],
  [5, 0x8fa8d8, 0.45, 10, 160, 0x2a3455, 0x14161c, 0.6, 0x131a33, 0x131a33, 130, 360, 1.00],
  [7, 0xffb37a, 1.2, 12, 110, 0xffd9b0, 0x8a6f5a, 0.7, 0xffc9a0, 0xf2b98a, 160, 400, 0.35],
  [9, 0xfff0d0, 2.4, 42, 80, 0xbfd8ff, 0x8a9a7a, 0.95, 0x8ec8ee, 0x9fd0e8, 180, 430, 0.0],
  [13, 0xffffff, 2.6, 68, 0, 0xcfe8ff, 0x9aa88a, 1.0, 0x87c5eb, 0x87c5eb, 180, 430, 0.0],
  [16, 0xffe9b0, 2.4, 38, 300, 0xcfe0ff, 0x9a8a72, 0.95, 0x9cc8e8, 0x9cc8e8, 180, 430, 0.0],
  [17.6, 0xffb066, 2.2, 14, 265, 0xffc9a0, 0x7a6a58, 0.8, 0xffb98a, 0xf0a878, 160, 400, 0.08],
  [19, 0xff7a5a, 1.3, 4, 255, 0x8a5a80, 0x3a3040, 0.65, 0x5a3a6a, 0x4a3258, 140, 380, 0.55],
  [20.5, 0x7a86c8, 0.6, 12, 240, 0x2a3455, 0x14161c, 0.6, 0x141a33, 0x141a33, 130, 360, 0.95],
  [22, 0x8fa8d8, 0.45, 25, 200, 0x1a2340, 0x0c0f14, 0.6, 0x0b1026, 0x0b1026, 120, 340, 1.00],
  [24, 0x8fa8d8, 0.45, 25, 200, 0x1a2340, 0x0c0f14, 0.6, 0x0b1026, 0x0b1026, 120, 340, 1.00],
];

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function lerpKey(h) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i += 1) {
    if (h >= KEYS[i][0] && h <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const span = (b[0] - a[0]) || 1;
  const t = Math.max(0, Math.min(1, (h - a[0]) / span));
  const mix = (ia, ib) => a[ia] + (b[ia] - a[ia]) * t;
  const col = (ia, ib) => _c1.setHex(a[ia]).lerp(_c2.setHex(b[ia]), t).getHex();
  return {
    sunColor: col(1, 1), sunI: mix(2, 2), elev: mix(3, 3), azim: mix(4, 4),
    hemiSky: col(5, 5), hemiGround: col(6, 6), hemiI: mix(7, 7),
    sky: col(8, 8), fog: col(9, 9), fogNear: mix(10, 10), fogFar: mix(11, 11),
    night: mix(12, 12),
  };
}

// A soft radial glow sprite texture, shared by lamps, neon and headlights.
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

// Registry: things whose brightness follows the night.
// kind 'emissive': material with emissiveIntensity day->night.
// kind 'basic': MeshBasicMaterial colour day->night (lamps, neon tubes).
// kind 'sprite': THREE.Sprite whose material.opacity follows night.
// kind 'rough': a material whose roughness follows night (wet asphalt).
const registry = { emissive: [], basic: [], sprite: [], rough: [] };
export function registerGlow(kind, obj, day, night) {
  registry[kind].push({ obj, day, night });
}
export function clearGlowRegistry() {
  registry.emissive.length = 0;
  registry.basic.length = 0;
  registry.sprite.length = 0;
  registry.rough.length = 0;
}

// A tiny procedural sky cubemap so glossy car paint has something to
// reflect. Six gradient faces, no files, no network.
export function makeSkyEnv() {
  const faces = [];
  const defs = [
    ['#7fb8e8', '#cfe8ff'], ['#7fb8e8', '#cfe8ff'], ['#a8d4f0', '#ffe9c0'],
    ['#3a4a5a', '#6a7a88'], ['#ffb98a', '#ffe9c0'], ['#ffb98a', '#ffe9c0'],
  ];
  for (const [top, bottom] of defs) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    faces.push(c);
  }
  const tex = new THREE.CubeTexture(faces);
  tex.needsUpdate = true;
  return tex;
}

export function createDayNight(scene, lights) {
  const dn = {
    hours: 17.6, // golden hour by default
    night: 0.08,
    rate: 1 / 60, // one game hour per real minute
    frozen: false,
    setHours(h) {
      dn.hours = ((h % 24) + 24) % 24;
      dn.apply();
    },
    apply() {
      const k = lerpKey(dn.hours);
      const el = (k.elev * Math.PI) / 180;
      const az = (k.azim * Math.PI) / 180;
      lights.sun.position.set(Math.cos(el) * Math.sin(az) * 220, Math.sin(el) * 220 + 20, Math.cos(el) * Math.cos(az) * 220);
      lights.sun.color.setHex(k.sunColor);
      lights.sun.intensity = k.sunI;
      lights.hemi.color.setHex(k.hemiSky);
      lights.hemi.groundColor.setHex(k.hemiGround);
      lights.hemi.intensity = k.hemiI;
      lights.amb.intensity = 0.25 + k.hemiI * 0.45;
      scene.background.setHex(k.sky);
      scene.fog.color.setHex(k.fog);
      scene.fog.near = k.fogNear;
      scene.fog.far = k.fogFar;
      dn.night = k.night;
      for (const r of registry.emissive) r.obj.emissiveIntensity = r.day + (r.night - r.day) * dn.night;
      for (const r of registry.basic) r.obj.color.setHex(r.day).lerp(_c2.setHex(r.night), dn.night);
      for (const r of registry.sprite) r.obj.material.opacity = r.day + (r.night - r.day) * dn.night;
      for (const r of registry.rough) r.obj.roughness = r.day + (r.night - r.day) * dn.night;
    },
    update(dt) {
      if (dn.frozen) return;
      dn.hours = (dn.hours + dt * dn.rate) % 24;
      dn.apply();
    },
  };
  return dn;
}
