// SUNPORT — cars: the player's ride, parked cars to steal, traffic AI
// and police interceptors. Six body types (sedan, convertible, muscle,
// sport, pickup, taxi) in bright paint, glossy MeshStandardMaterial with
// the sky env map, headlights and taillights that glow at night, and a
// black-and-white police interceptor with a flashing light bar. Arcade
// drive model (accelerate, steer, handbrake); traffic cars cruise the
// street grid in lanes and wrap around at the map edge.
import * as THREE from 'three';
import { CFG } from './config.js';
import { registerGlow, glowTexture, makeSkyEnv } from './daynight.js';

const CAR_COLORS = [0xd83a2e, 0x2e6fd8, 0xe8c832, 0x32d84a, 0xd832a0, 0xf2f2f2, 0x222222, 0xff7f2a, 0x7f5fd8, 0xf2a7b8, 0x19e3ff, 0xffd24a];
const CAR_TYPES = ['sedan', 'convertible', 'muscle', 'sport', 'pickup', 'taxi'];

// The sky env map is applied ONLY to car paint and glass: glossy cars get
// reflections, while buildings and roads skip the cubemap sample per pixel.
let envTex = null;
function carEnv() {
  if (!envTex) envTex = makeSkyEnv();
  return envTex;
}

export function makeCarMesh(color, isPolice = false, type = 'sedan', glowLights = true) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color, metalness: 0.8, roughness: 0.25, envMap: carEnv(), envMapIntensity: 1.0,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x141c26, metalness: 0.9, roughness: 0.12, envMap: carEnv(), envMapIntensity: 1.2,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.4, roughness: 0.6 });
  // Body proportions vary by type; the front is +z (heading direction).
  const dims = {
    sedan: { w: 2.0, h: 0.65, l: 4.4, cabW: 1.7, cabH: 0.6, cabL: 2.2, cabZ: -0.2, y: 0.55 },
    convertible: { w: 2.0, h: 0.6, l: 4.5, cabW: 1.7, cabH: 0.28, cabL: 1.6, cabZ: -0.5, y: 0.52 },
    muscle: { w: 2.1, h: 0.7, l: 4.7, cabW: 1.7, cabH: 0.62, cabL: 2.0, cabZ: -0.3, y: 0.57 },
    sport: { w: 2.0, h: 0.52, l: 4.5, cabW: 1.6, cabH: 0.5, cabL: 2.0, cabZ: -0.3, y: 0.48 },
    pickup: { w: 2.1, h: 0.7, l: 5.0, cabW: 1.8, cabH: 0.7, cabL: 1.6, cabZ: -0.9, y: 0.6 },
    taxi: { w: 2.0, h: 0.65, l: 4.4, cabW: 1.7, cabH: 0.6, cabL: 2.2, cabZ: -0.2, y: 0.55 },
  }[type] || { w: 2.0, h: 0.65, l: 4.4, cabW: 1.7, cabH: 0.6, cabL: 2.2, cabZ: -0.2, y: 0.55 };
  const body = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.l), bodyMat);
  body.position.y = dims.y;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(dims.cabW, dims.cabH, dims.cabL), type === 'convertible' ? bodyMat : glassMat);
  cabin.position.set(0, dims.y + dims.h / 2 + dims.cabH / 2 - 0.05, dims.cabZ);
  g.add(body, cabin);
  // Muscle hood scoop, sport spoiler, pickup bed, taxi roof sign.
  if (type === 'muscle') {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 1.0), darkMat);
    scoop.position.set(0, dims.y + dims.h / 2 + 0.09, 1.2);
    g.add(scoop);
  }
  if (type === 'sport') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.4), darkMat);
    spoiler.position.set(0, dims.y + dims.h / 2 + 0.35, -dims.l / 2 + 0.2);
    g.add(spoiler);
    for (const sx of [-0.8, 0.8]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), darkMat);
      strut.position.set(sx, dims.y + dims.h / 2 + 0.18, -dims.l / 2 + 0.2);
      g.add(strut);
    }
  }
  if (type === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(dims.w - 0.3, 0.35, 1.8), darkMat);
    bed.position.set(0, dims.y + dims.h / 2 + 0.12, 1.4);
    g.add(bed);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffd24a }),
    );
    sign.position.set(0, dims.y + dims.h / 2 + dims.cabH + 0.12, dims.cabZ);
    g.add(sign);
  }
  // Wheels.
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    wheels.push(w);
    g.add(w);
  }
  // Headlights (front, +z) and taillights (rear, -z), glowing at night.
  const headMat = new THREE.MeshBasicMaterial({ color: 0x444433 });
  registerGlow('basic', headMat, 0x444433, 0xfff6c8);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x551111 });
  registerGlow('basic', tailMat, 0x551111, 0xff2222);
  for (const hx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), headMat);
    hl.position.set(hx, dims.y + 0.08, dims.l / 2 + 0.02);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.1), tailMat);
    tl.position.set(hx, dims.y + 0.08, -dims.l / 2 - 0.02);
    g.add(tl);
  }
  const glowTex = glowTexture();
  if (glowLights) {
    for (const hx of [-0.7, 0.7]) {
      const smat = new THREE.SpriteMaterial({
        map: glowTex, color: 0xfff6c8, transparent: true, opacity: 0, depthWrite: false,
      });
      registerGlow('sprite', { material: smat }, 0, 0.5);
      const spr = new THREE.Sprite(smat);
      spr.scale.set(2.2, 2.2, 1);
      spr.position.set(hx, dims.y + 0.08, dims.l / 2 + 0.5);
      g.add(spr);
    }
  }
  if (isPolice) {
    // Black-and-white Sunport PD: white body, black hood and trunk bands.
    bodyMat.color.setHex(0xf2f2f2);
    const bandMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const hood = new THREE.Mesh(new THREE.BoxGeometry(dims.w + 0.02, 0.1, 1.1), bandMat);
    hood.position.set(0, dims.y + dims.h / 2 + 0.02, dims.l / 2 - 0.55);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(dims.w + 0.02, 0.1, 1.0), bandMat);
    trunk.position.set(0, dims.y + dims.h / 2 + 0.02, -dims.l / 2 + 0.5);
    g.add(hood, trunk);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), barMat);
    bar.position.set(0, dims.y + dims.h / 2 + dims.cabH + 0.1, dims.cabZ);
    g.add(bar);
    g.userData.barMat = barMat;
    g.userData.barT = Math.random();
  }
  g.userData.wheels = wheels;
  g.userData.type = type;
  return g;
}

export function createCar(x, z, heading, color, kind = 'traffic', type = 'sedan') {
  return {
    x, z, heading, speed: 0,
    color, kind, // 'traffic' | 'parked' | 'player' | 'police'
    type,
    mesh: makeCarMesh(color, kind === 'police', type, kind !== 'traffic'),
    ai: null, // traffic lane state
    hp: 100,
    dead: false,
  };
}

// Drive the player's car: W/S throttle, A/D steer, Space handbrake.
// The touch joystick feeds the same `input.stick` vector (y up = gas).
export function stepPlayerCar(car, input, dt, city, fx, audio) {
  const k = input.keys;
  const st = input.stick || { x: 0, y: 0 };
  const fwd = Math.max(-1, Math.min(1, (k.has('forward') ? 1 : 0) - (k.has('back') ? 1 : 0) - st.y));
  const steer = Math.max(-1, Math.min(1, (k.has('left') ? 1 : 0) - (k.has('right') ? 1 : 0) - st.x));
  if (fwd > 0) car.speed += CFG.carAccel * dt * Math.min(1, fwd);
  else if (fwd < 0) car.speed -= (car.speed > 0.5 ? CFG.carBrake : CFG.carAccel * 0.6) * dt * Math.min(1, -fwd);
  else if (!input.shotMode) car.speed *= Math.max(0, 1 - 1.4 * dt); // staged shots hold their cruise speed
  if (k.has('jump')) car.speed *= Math.max(0, 1 - 3 * dt); // Space = handbrake
  car.speed = Math.max(-CFG.carMaxReverse, Math.min(CFG.carMaxSpeed, car.speed));
  const turnRate = CFG.carTurn * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 8);
  car.heading += steer * turnRate * dt;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const probe = { x: nx, z: nz };
  city.collideCircle(probe, CFG.carRadius);
  const hitWall = Math.abs(probe.x - nx) > 0.01 || Math.abs(probe.z - nz) > 0.01;
  if (hitWall && Math.abs(car.speed) > 6) {
    fx.burst(car.x, 1, car.z, 0xffcc55, 10, 7);
    fx.addShake(0.25);
    audio.crash();
    car.speed *= 0.4;
  }
  car.x = probe.x;
  car.z = probe.z;
  syncCarMesh(car, dt);
}

export function syncCarMesh(car, dt) {
  if (!car.mesh) return;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.38;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
}

// Traffic: each car owns one street lane and drives straight, wrapping at
// the far edge. Cheap, readable from the minimap, and it never blocks the
// player for long.
export function spawnTraffic(scene, rng, city) {
  const cars = [];
  for (let i = 0; i < CFG.trafficCount; i += 1) {
    const alongZ = rng.next() < 0.5;
    const street = rng.pick(CFG.streets);
    const lane = rng.pick([-3, 3]);
    const dir = rng.pick([-1, 1]);
    const pos = rng.range(-170, 170);
    const x = alongZ ? street + lane : pos;
    const z = alongZ ? pos : street + lane;
    const heading = alongZ ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const type = rng.pick(CAR_TYPES);
    const car = createCar(x, z, heading, rng.pick(CAR_COLORS), 'traffic', type);
    car.ai = { alongZ, street, lane, dir, speed: rng.range(8, 14) };
    car.speed = car.ai.speed;
    scene.add(car.mesh);
    syncCarMesh(car, 0);
    cars.push(car);
  }
  return cars;
}

export function stepTraffic(cars, dt, city) {
  for (const car of cars) {
    const a = car.ai;
    if (!a) continue;
    if (a.alongZ) {
      car.z += a.dir * a.speed * dt;
      if (car.z > 178) car.z = -178;
      if (car.z < -178) car.z = 178;
    } else {
      car.x += a.dir * a.speed * dt;
      if (car.x > 178) car.x = -178;
      if (car.x < -178) car.x = 178;
    }
    syncCarMesh(car, dt);
  }
}

export function spawnParked(scene, rng, city) {
  const cars = [];
  for (let i = 0; i < CFG.parkedCount; i += 1) {
    // Park on the sidewalk, but only where no building stands: probe the
    // spot with the city collision and retry until it stays put.
    let x = 0; let z = 0; let heading = 0;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const street = rng.pick(CFG.streets);
      const alongZ = rng.next() < 0.5;
      const pos = rng.range(-160, 160);
      const side = rng.pick([-9, 9]);
      const tx = alongZ ? street + side : pos;
      const tz = alongZ ? pos : street + side;
      const probe = { x: tx, z: tz };
      city.collideCircle(probe, 2);
      if (Math.hypot(probe.x - tx, probe.z - tz) < 0.5) {
        x = tx; z = tz; heading = alongZ ? 0 : Math.PI / 2;
        break;
      }
      x = tx; z = tz; heading = alongZ ? 0 : Math.PI / 2;
    }
    // Palmera Boulevard gets convertibles parked along the beach.
    const type = Math.abs(x - 160) < 12 || Math.abs(z - 160) < 12
      ? rng.pick(['convertible', 'sport', 'convertible', 'sedan'])
      : rng.pick(CAR_TYPES);
    const car = createCar(x, z, heading, rng.pick(CAR_COLORS), 'parked', type);
    scene.add(car.mesh);
    syncCarMesh(car, 0);
    cars.push(car);
  }
  return cars;
}

export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bd = maxDist;
  for (const c of cars) {
    if (c.dead) continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
