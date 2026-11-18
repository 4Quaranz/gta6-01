// SUNPORT v2 — vehicles: six drivable types (sedan, convertible, muscle,
// sport, pickup, taxi) plus the traffic that keeps the streets alive.
// Traffic follows the road lanes, brakes for the car ahead and turns at
// intersections; the player can steal any parked car or a slow one.

import * as THREE from 'three';
import { ROADS_X, ROADS_Z, ROAD_W, SPEEDS, clamp } from './config.js';
import { collideCircle, clampToLand } from './city.js';

const CAR_COLORS = [0xd84a4a, 0x3a7ac6, 0xe8d84a, 0x4ad88a, 0xf2f2f2, 0xff8a3a, 0x9a4ad8, 0x2a2a2a, 0x19b8c4];
const TAXI_COLOR = 0xf2c200;

export function makeCarMesh(type, colorHex) {
  const g = new THREE.Group();
  // Low metalness on purpose: with no environment map, a highly metallic
  // paint goes near-black at dusk and night, and the player's car would
  // vanish from behind. 0.3 keeps the colour readable in any light.
  const paint = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.3, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x101820, metalness: 0.9, roughness: 0.08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.9, roughness: 0.2 });

  function part(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }

  const low = type === 'sport';
  const bodyH = low ? 0.55 : 0.75;
  const bodyY = low ? 0.55 : 0.65;
  const len = type === 'muscle' || type === 'pickup' ? 4.8 : 4.3;
  const wid = type === 'sport' ? 2.1 : 1.95;
  // Main body + hood/trunk shaping.
  part(wid, bodyH, len, 0, bodyY, 0, paint);
  part(wid * 0.92, 0.28, len * 0.5, 0, bodyY + bodyH / 2 + 0.1, -len * 0.18, paint);
  // Cabin (not on the convertible or the pickup bed).
  if (type !== 'convertible' && type !== 'pickup') {
    part(wid * 0.82, 0.62, len * 0.42, 0, bodyY + bodyH / 2 + 0.45, -len * 0.04, glass);
    part(wid * 0.84, 0.1, len * 0.44, 0, bodyY + bodyH / 2 + 0.78, -len * 0.04, paint);
  }
  if (type === 'convertible') {
    part(wid * 0.7, 0.5, 0.5, 0, bodyY + bodyH / 2 + 0.2, -len * 0.28, glass);
    part(wid * 0.86, 0.12, 0.3, 0, bodyY + bodyH / 2 + 0.5, -len * 0.28, paint);
  }
  if (type === 'pickup') {
    part(wid * 0.8, 0.55, len * 0.34, 0, bodyY + bodyH / 2 + 0.2, -len * 0.3, glass);
    // Open bed with side walls.
    part(0.12, 0.5, len * 0.34, -wid / 2 + 0.06, bodyY + bodyH / 2 + 0.25, len * 0.28, paint);
    part(0.12, 0.5, len * 0.34, wid / 2 - 0.06, bodyY + bodyH / 2 + 0.25, len * 0.28, paint);
    part(wid, 0.5, 0.12, 0, bodyY + bodyH / 2 + 0.25, len * 0.44, paint);
  }
  if (type === 'muscle') {
    // Hood scoop.
    part(0.7, 0.18, 1.1, 0, bodyY + bodyH / 2 + 0.3, len * 0.22, dark);
  }
  if (type === 'taxi') {
    part(0.9, 0.3, 0.5, 0, bodyY + bodyH / 2 + 0.85, 0, new THREE.MeshStandardMaterial({ color: 0x111111 }));
    const sign = part(0.7, 0.22, 0.4, 0, bodyY + bodyH / 2 + 1.05, 0, new THREE.MeshBasicMaterial({ color: 0xffd24a }));
    sign.castShadow = false;
  }
  // Bumpers + grille.
  part(wid * 0.95, 0.22, 0.18, 0, 0.42, len / 2, chrome);
  part(wid * 0.95, 0.22, 0.18, 0, 0.42, -len / 2, chrome);
  // Headlights (emissive at night) and taillights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xfff2b0, emissiveIntensity: 0.15 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa2222, emissive: 0xff2222, emissiveIntensity: 0.25 });
  part(0.42, 0.22, 0.1, -wid / 2 + 0.35, 0.72, len / 2 + 0.02, headMat);
  part(0.42, 0.22, 0.1, wid / 2 - 0.35, 0.72, len / 2 + 0.02, headMat);
  part(0.42, 0.18, 0.1, -wid / 2 + 0.35, 0.72, -len / 2 - 0.02, tailMat);
  part(0.42, 0.18, 0.1, wid / 2 - 0.35, 0.72, -len / 2 - 0.02, tailMat);
  // Wheels: spin with speed, front pair steers.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8);
  const wheels = [];
  for (const [wx, wz, front] of [[-0.85, 1.45, true], [0.85, 1.45, true], [-0.85, -1.45, false], [0.85, -1.45, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, chrome);
    hub.rotation.z = Math.PI / 2;
    pivot.add(w);
    pivot.add(hub);
    g.add(pivot);
    wheels.push({ pivot, spin: w, front });
  }
  g.userData.paintMat = paint;
  g.userData.headMat = headMat;
  g.userData.tailMat = tailMat;
  g.userData.wheels = wheels;
  g.userData.len = len;
  g.userData.wid = wid;
  return g;
}

export class Vehicles {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.parked = [];
    this.traffic = [];
    for (const s of city.parkedSpots) {
      const car = this.spawnCar(s.type, s.x, s.z, s.yaw);
      car.isParked = true;
      this.parked.push(car);
    }
    // 22 traffic cars spread over the avenues and streets.
    for (let i = 0; i < 22; i++) {
      const onAvenue = rng.next() < 0.5;
      const road = onAvenue
        ? { axis: 'x', line: rng.pick(ROADS_X) }
        : { axis: 'z', line: rng.pick(ROADS_Z) };
      const along = rng.range(-160, 200);
      const dir = rng.next() < 0.5 ? 1 : -1;
      const lane = (rng.next() < 0.5 ? 1 : -1) * 2.2;
      const x = road.axis === 'x' ? road.line + lane : along;
      const z = road.axis === 'x' ? along : road.line + lane;
      const type = rng.pick(['sedan', 'sedan', 'convertible', 'muscle', 'sport', 'pickup', 'taxi']);
      const car = this.spawnCar(type, x, z, 0);
      car.isParked = false;
      car.road = road;
      car.dir = dir;
      car.lane = lane;
      car.speed = rng.range(7, 13);
      car.targetSpeed = car.speed;
      // Face along the road in the driving direction.
      car.yaw = road.axis === 'x' ? (dir > 0 ? Math.PI : 0) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.traffic.push(car);
    }
  }

  spawnCar(type, x, z, yaw) {
    const color = type === 'taxi' ? TAXI_COLOR : this.rng.pick(CAR_COLORS);
    const mesh = makeCarMesh(type, color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
    const car = {
      mesh, type, x, z, yaw, speed: 0, steer: 0,
      isParked: false, isPlayer: false,
      headMat: mesh.userData.headMat,
      tailMat: mesh.userData.tailMat,
      wheels: mesh.userData.wheels,
      len: mesh.userData.len,
    };
    return car;
  }

  nearestCar(x, z, r) {
    let best = null;
    let bd = r;
    for (const c of [...this.parked, ...this.traffic]) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // Player driving: arcade throttle/brake/steer with building collision.
  drivePlayer(car, input, dt, ctx) {
    const fwd = input.keys.has('KeyW') || input.keys.has('ArrowUp') || input.stick.y < -0.3;
    const back = input.keys.has('KeyS') || input.keys.has('ArrowDown') || input.stick.y > 0.3;
    const left = input.keys.has('KeyA') || input.keys.has('ArrowLeft') || input.stick.x < -0.3;
    const right = input.keys.has('KeyD') || input.keys.has('ArrowRight') || input.stick.x > 0.3;
    const steerIn = (left ? 1 : 0) - (right ? 1 : 0);
    // Space is the handbrake: hard stop plus a sharper turn for drifts.
    const handbrake = input.keys.has('Space');
    if (fwd) car.speed += SPEEDS.carAccel * dt;
    if (back) car.speed -= (car.speed > 0.5 ? SPEEDS.carBrake : SPEEDS.carAccel * 0.6) * dt;
    if (!fwd && !back) car.speed -= Math.sign(car.speed) * 6 * dt;
    if (handbrake) {
      const dec = 42 * dt;
      car.speed = Math.abs(car.speed) <= dec ? 0 : car.speed - Math.sign(car.speed) * dec;
    }
    if (Math.abs(car.speed) < 0.2 && !fwd && !back) car.speed = 0;
    car.speed = clamp(car.speed, -SPEEDS.carReverseMax, SPEEDS.carMax);
    const steerTarget = steerIn * 0.5 * Math.min(1, Math.abs(car.speed) / 8 + 0.25) * (handbrake ? 1.6 : 1);
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
    car.yaw += car.steer * SPEEDS.carTurn * (car.speed / SPEEDS.carMax) * dt * (car.speed >= 0 ? 1 : -1);
    let nx = car.x + Math.sin(car.yaw) * car.speed * dt;
    let nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    const fixed = collideCircle(nx, nz, 1.7, ctx.colliders);
    const land = clampToLand(fixed.x, fixed.z);
    // Hitting a wall hard stops the car.
    if (Math.abs(land.x - nx) > 0.01 || Math.abs(land.z - nz) > 0.01) car.speed *= 0.4;
    car.x = land.x;
    car.z = land.z;
    this.syncMesh(car, dt);
    // Running over a pedestrian: they are knocked down and the heat rises.
    if (Math.abs(car.speed) > 4 && ctx.pedestrians) {
      const ped = ctx.pedestrians.nearest(car.x, car.z, 2.2);
      if (ped) {
        ctx.pedestrians.knock(ped, car.x, car.z, 6);
        if (ctx.state) ctx.state.wantedHeat = Math.min(100, (ctx.state.wantedHeat || 0) + 20);
      }
    }
    return car.speed;
  }

  syncMesh(car, dt) {
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
    for (const w of car.wheels) {
      w.spin.rotation.x += (car.speed * dt) / 0.36;
      if (w.front) w.pivot.rotation.y = car.steer * 0.55;
    }
  }

  update(dt, ctx) {
    const night = ctx.daynight ? ctx.daynight.isNight : false;
    // Traffic: follow the lane, brake for the car ahead, turn sometimes.
    for (const car of this.traffic) {
      // Car ahead in the same lane?
      let ahead = null;
      let aheadD = 10;
      for (const o of this.traffic) {
        if (o === car) continue;
        const dx = o.x - car.x;
        const dz = o.z - car.z;
        const fx = Math.sin(car.yaw);
        const fz = Math.cos(car.yaw);
        const along = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (along > 0 && along < aheadD && side < 2.4) { ahead = o; aheadD = along; }
      }
      const target = ahead ? Math.max(0, ahead.speed - 1) : car.targetSpeed;
      car.speed += clamp(target - car.speed, -10 * dt, 6 * dt);
      // At an intersection, sometimes turn onto the cross road.
      const nearX = ROADS_X.find((r) => Math.abs(car.x - r) < 2.5);
      const nearZ = ROADS_Z.find((r) => Math.abs(car.z - r) < 2.5);
      if (car.road.axis === 'x' && nearZ !== undefined && Math.abs(car.z - nearZ) < 1.2 && this.rng.next() < dt * 0.25) {
        car.road = { axis: 'z', line: nearZ };
        car.dir = this.rng.next() < 0.5 ? 1 : -1;
        car.lane = (this.rng.next() < 0.5 ? 1 : -1) * 2.2;
      } else if (car.road.axis === 'z' && nearX !== undefined && Math.abs(car.x - nearX) < 1.2 && this.rng.next() < dt * 0.25) {
        car.road = { axis: 'x', line: nearX };
        car.dir = this.rng.next() < 0.5 ? 1 : -1;
        car.lane = (this.rng.next() < 0.5 ? 1 : -1) * 2.2;
      }
      // Target yaw for the current road + direction.
      const targetYaw = car.road.axis === 'x'
        ? (car.dir > 0 ? Math.PI : 0)
        : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      let dy = targetYaw - car.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      car.yaw += clamp(dy, -1.6 * dt, 1.6 * dt);
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      // Keep on the lane: nudge back toward the road line.
      if (car.road.axis === 'x') {
        const wantX = car.road.line + car.lane;
        car.x += clamp(wantX - car.x, -2 * dt, 2 * dt);
        if (car.z > 205) car.dir = -1;
        if (car.z < -165) car.dir = 1;
      } else {
        const wantZ = car.road.line + car.lane;
        car.z += clamp(wantZ - car.z, -2 * dt, 2 * dt);
        if (car.x > 205) car.dir = -1;
        if (car.x < -165) car.dir = 1;
      }
      this.syncMesh(car, dt);
    }
    // Headlights on at night, and taillights bright enough to read the
    // car from behind after dark.
    const headI = night ? 1.6 : 0.15;
    const tailI = night ? 1.2 : 0.25;
    for (const c of [...this.parked, ...this.traffic]) {
      if (c.headMat) c.headMat.emissiveIntensity = headI;
      if (c.tailMat) c.tailMat.emissiveIntensity = tailI;
    }
    // The player's car is driven by drivePlayer, not here.
    if (ctx.player && ctx.player.car) this.syncMesh(ctx.player.car, dt);
  }
}
