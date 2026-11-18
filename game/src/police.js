// SUNPORT v2 — the police. Wanted stars scale the response: patrol cars,
// foot cops, and a spotlight helicopter at 4+. The key rule from the
// user's feedback: after the player punches someone, police cars do NOT
// ram straight away. They approach, slow down and circle the player at
// a distance (STANDOFF), and may only ram after a few seconds have
// passed — or when the wanted level is already high.

import * as THREE from 'three';
import { WANTED, ROADS_X, ROADS_Z } from './config.js';
import { makeCarMesh } from './vehicles.js';
import { buildAvatar, poseWalk } from './player.js';
import { collideCircle, clampToLand } from './city.js';

function policeCarMesh() {
  const g = makeCarMesh('sedan', 0x16181c);
  // White doors + light bar.
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.5, 1.6), white);
  door.position.set(0, 0.72, -0.1);
  door.castShadow = true;
  g.add(door);
  const barMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1.5 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4), barMat);
  bar.position.set(0, 1.75, -0.1);
  g.add(bar);
  const bar2Mat = new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1.5 });
  const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), bar2Mat);
  bar2.position.set(0.3, 1.75, -0.1);
  g.add(bar2);
  g.userData.barMat = barMat;
  g.userData.bar2Mat = bar2Mat;
  return g;
}

function heliMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.6, 1.8), bodyMat);
  body.position.y = 0;
  body.castShadow = true;
  g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 0.7), bodyMat);
  tail.position.set(-3.4, 0.3, 0);
  g.add(tail);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.7), new THREE.MeshStandardMaterial({ color: 0x19e3ff, roughness: 0.1, metalness: 0.6 }));
  glass.position.set(1.8, 0.2, 0);
  g.add(glass);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  rotor.position.y = 1.1;
  g.add(rotor);
  const spot = new THREE.Mesh(
    new THREE.ConeGeometry(6, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  spot.position.y = -15;
  spot.rotation.x = Math.PI;
  g.add(spot);
  g.userData.rotor = rotor;
  return g;
}

export class Police {
  constructor(scene, rng, city, vehicles) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.vehicles = vehicles;
    this.cars = []; // police cars: {mesh, x, z, yaw, speed, mode, standoffT, ramCooldown}
    this.cops = []; // foot cops: {fig, x, z, yaw, phase, touchT}
    this.heli = null;
    this.spawnT = 0;
    this.copSpawnT = 0;
    this.ramAllowedAt = 0; // no ramming before this sim time
    this.noWantedT = 0;
  }

  // Called whenever the player punches someone: police hold off ramming.
  onPunch(now) {
    this.ramAllowedAt = Math.max(
      this.ramAllowedAt,
      now + WANTED.punchGraceSec + WANTED.punchStandoffExtra,
    );
    for (const c of this.cars) {
      if (c.mode === 'RAM') { c.mode = 'STANDOFF'; c.standoffT = 0; }
    }
  }

  desiredCars(wanted) {
    if (wanted <= 0) return 0;
    return Math.min(1 + Math.floor(wanted / 2), 4);
  }

  desiredCops(wanted) {
    if (wanted < 2) return 0;
    return Math.min(wanted, 4);
  }

  spawnCar(px, pz, now) {
    // Spawn on a road 45–60 m from the player, facing roughly at them.
    const road = this.rng.next() < 0.5 ? { axis: 'x', line: this.rng.pick(ROADS_X) } : { axis: 'z', line: this.rng.pick(ROADS_Z) };
    let x;
    let z;
    let tries = 0;
    do {
      if (road.axis === 'x') { x = road.line + (this.rng.next() < 0.5 ? 2.2 : -2.2); z = this.rng.range(-160, 200); }
      else { z = road.line + (this.rng.next() < 0.5 ? 2.2 : -2.2); x = this.rng.range(-160, 200); }
      tries++;
    } while (Math.hypot(x - px, z - pz) < 40 && tries < 12);
    const mesh = policeCarMesh();
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const car = {
      mesh, x, z, yaw: Math.atan2(px - x, pz - z), speed: 0,
      mode: 'APPROACH', standoffT: 0, ramCooldown: 0,
    };
    this.cars.push(car);
    return car;
  }

  spawnCop(px, pz) {
    const a = this.rng.next() * Math.PI * 2;
    const x = px + Math.cos(a) * 26;
    const z = pz + Math.sin(a) * 26;
    const fig = buildAvatar({ shirt: 0x1a2a4a, pants: 0x1a1a1a, skin: 0xc98e6a, hair: 0x1a1a1a, face: 4 });
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x1a2a4a }));
    hat.position.set(0, 0.36, 0);
    fig.head.add(hat);
    this.scene.add(fig.group);
    const cop = { fig, x, z, yaw: 0, phase: this.rng.next() * 6, touchT: 0, health: 100, staggerT: 0 };
    this.cops.push(cop);
    return cop;
  }

  spawnHeli(px, pz) {
    const mesh = heliMesh();
    mesh.position.set(px + 30, 46, pz - 20);
    this.scene.add(mesh);
    this.heli = { mesh, angle: 0 };
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    this.cars.splice(this.cars.indexOf(car), 1);
  }

  removeCop(cop) {
    this.scene.remove(cop.fig.group);
    this.cops.splice(this.cops.indexOf(cop), 1);
  }

  update(dt, ctx) {
    const now = ctx.time;
    const p = ctx.player;
    const wanted = ctx.state.wanted;
    // Spawning.
    this.spawnT -= dt;
    if (this.cars.length < this.desiredCars(wanted) && this.spawnT <= 0) {
      this.spawnCar(p.x, p.z, now);
      this.spawnT = 1.6;
    }
    this.copSpawnT -= dt;
    if (this.cops.length < this.desiredCops(wanted) && this.copSpawnT <= 0) {
      this.spawnCop(p.x, p.z);
      this.copSpawnT = 1.8;
    }
    if (wanted >= 4 && !this.heli) this.spawnHeli(p.x, p.z);
    if (wanted < 4 && this.heli) {
      this.scene.remove(this.heli.mesh);
      this.heli = null;
    }
    // Stand down when the heat is gone.
    if (wanted === 0) {
      this.noWantedT += dt;
      if (this.noWantedT > 12) {
        for (const c of [...this.cars]) this.removeCar(c);
        for (const c of [...this.cops]) this.removeCop(c);
        this.noWantedT = 0;
      }
    } else {
      this.noWantedT = 0;
    }

    const px = p.x;
    const pz = p.z;
    const canRam = now > this.ramAllowedAt;
    // --- Police cars ------------------------------------------------------
    for (const c of [...this.cars]) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const targetYaw = Math.atan2(dx, dz);
      let dy = targetYaw - c.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      if (c.ramCooldown > 0) c.ramCooldown -= dt;
      if (c.mode === 'APPROACH') {
        c.speed = Math.min(c.speed + 16 * dt, 26);
        c.yaw += THREE.MathUtils.clamp(dy, -2.2 * dt, 2.2 * dt);
        if (dist < 18) { c.mode = 'STANDOFF'; c.standoffT = 0; }
      } else if (c.mode === 'STANDOFF') {
        c.standoffT += dt;
        // Circle the player at 12–18 m, keeping a respectful distance.
        const orbitYaw = targetYaw + Math.PI / 2 + 0.6;
        let ody = orbitYaw - c.yaw;
        while (ody > Math.PI) ody -= Math.PI * 2;
        while (ody < -Math.PI) ody += Math.PI * 2;
        c.yaw += THREE.MathUtils.clamp(ody, -1.8 * dt, 1.8 * dt);
        c.speed = dist > 18 ? 12 : dist < 12 ? 8 : 10;
        const ramOk = canRam && c.standoffT > WANTED.ramStandoffSec && c.ramCooldown <= 0;
        const highWantedRam = wanted >= WANTED.ramMinStars && c.standoffT > WANTED.ramStandoffSec && c.ramCooldown <= 0;
        if (ramOk || highWantedRam) { c.mode = 'RAM'; }
      } else { // RAM
        c.speed = Math.min(c.speed + 22 * dt, 34);
        c.yaw += THREE.MathUtils.clamp(dy, -2.6 * dt, 2.6 * dt);
        if (dist < 3.2) {
          // Impact: shove the player (or their car) and back off.
          ctx.onRam(c);
          c.mode = 'STANDOFF';
          c.standoffT = 0;
          c.ramCooldown = 6;
          c.speed = 6;
        }
        if (dist > 26) { c.mode = 'STANDOFF'; c.standoffT = 0; }
      }
      c.x += Math.sin(c.yaw) * c.speed * dt;
      c.z += Math.cos(c.yaw) * c.speed * dt;
      const fixed = collideCircle(c.x, c.z, 1.7, this.city.colliders);
      const land = clampToLand(fixed.x, fixed.z);
      c.x = land.x;
      c.z = land.z;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.yaw;
      // Light bar flashes red/blue.
      const on = Math.sin(now * 9) > 0;
      c.mesh.userData.barMat.emissiveIntensity = on ? 2.2 : 0.2;
      c.mesh.userData.bar2Mat.emissiveIntensity = on ? 0.2 : 2.2;
      if (c.mesh.userData.headMat) c.mesh.userData.headMat.emissiveIntensity = ctx.daynight && ctx.daynight.isNight ? 1.6 : 0.15;
    }

    // --- Foot cops ---------------------------------------------------------
    for (const cop of [...this.cops]) {
      if (cop.staggerT > 0) cop.staggerT = Math.max(0, cop.staggerT - dt);
      const dx = px - cop.x;
      const dz = pz - cop.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      cop.yaw = Math.atan2(dx, dz);
      if (cop.staggerT <= 0) {
        const sp = 5.4;
        cop.x += (dx / dist) * sp * dt;
        cop.z += (dz / dist) * sp * dt;
        cop.phase += dt * sp * 2.2;
        poseWalk(cop.fig, cop.phase, 0.9, 0.14);
      }
      const fixed = collideCircle(cop.x, cop.z, 0.5, this.city.colliders);
      cop.x = fixed.x;
      cop.z = fixed.z;
      cop.fig.group.position.set(cop.x, 0, cop.z);
      cop.fig.group.rotation.y = cop.yaw;
      // Close enough for long enough: BUSTED.
      if (dist < 1.3 && p.onFoot) {
        cop.touchT += dt;
        if (cop.touchT > 1.0) ctx.onBust();
      } else {
        cop.touchT = 0;
      }
    }

    // --- Helicopter: slow orbit, spotlight on the player -------------------
    if (this.heli) {
      const h = this.heli;
      h.angle += dt * 0.35;
      const hx = px + Math.cos(h.angle) * 30;
      const hz = pz + Math.sin(h.angle) * 30;
      h.mesh.position.set(hx, 36 + Math.sin(now * 0.8) * 1.5, hz);
      h.mesh.lookAt(px, 0, pz);
      h.mesh.userData.rotor.rotation.y += dt * 28;
    }
  }
}
