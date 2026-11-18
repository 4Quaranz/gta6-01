// SUNPORT v3 — police: patrol cars, foot cops and the helicopter.
// A punch buys a no-ram grace: every car falls back to STANDOFF and may not
// RAM until the grace ends (and then only after a standoff, or at 4+ stars).
// Written fresh.
import * as THREE from 'three';
import { POLICE, CAR, WANTED } from './config.js';
import { makeCar } from './vehicles.js';
import { makePersonFigure } from './pedestrians.js';
import { makeRng } from './rng.js';

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Police {
  constructor(G) {
    this.G = G;
    this.rng = makeRng(11);
    this.cars = []; // { car, mode, standoffT, ramCooldown, orbitA }
    this.cops = []; // foot cops { x, z, yaw, fig, health, bustT }
    this.heli = null;
    this.ramAllowedAt = -100;
    this.bustT = 0;
  }

  onPunch(now) {
    this.ramAllowedAt = now + POLICE.graceAfterPunch;
    for (const c of this.cars) {
      c.mode = 'STANDOFF';
      c.standoffT = 0;
    }
  }

  reset() {
    while (this.cars.length) this.removeCar(this.cars[0]);
    while (this.cops.length) this.removeCop(this.cops[0]);
    if (this.heli) {
      this.G.scene.remove(this.heli.group);
      this.heli = null;
    }
    this.ramAllowedAt = -100;
    this.bustT = 0;
  }

  wantedCount() {
    return this.G.state.wanted;
  }

  spawnCar() {
    const G = this.G;
    const car = makeCar('police');
    const p = G.player;
    const a = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(38, 55);
    car.x = p.x + Math.cos(a) * d;
    car.z = p.z + Math.sin(a) * d;
    const fixed = G.city.resolveCircle(car.x, car.z, CAR.radius);
    car.x = fixed.x;
    car.z = fixed.z;
    car.yaw = Math.atan2(p.x - car.x, p.z - car.z);
    car.sync();
    G.scene.add(car.group);
    const entry = { car, mode: 'APPROACH', standoffT: 0, ramCooldown: 0, orbitA: this.rng.range(0, Math.PI * 2) };
    this.cars.push(entry);
    return entry;
  }

  spawnCop() {
    const G = this.G;
    const p = G.player;
    const a = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(16, 26);
    const x = p.x + Math.cos(a) * d;
    const z = p.z + Math.sin(a) * d;
    const fixed = G.city.resolveCircle(x, z, 0.6);
    // Foot cops are visible figures in a dark uniform, like any pedestrian.
    const fig = makePersonFigure({
      skin: 0xc98d64,
      shirt: 0x1a2a3a,
      pants: 0x1a2a3a,
      hairColor: 0x1a1a1a,
      faceVariant: 8,
      hat: 'cap',
      hatColor: 0x1a2a3a,
    });
    fig.group.position.set(fixed.x, 0, fixed.z);
    G.scene.add(fig.group);
    const cop = { x: fixed.x, z: fixed.z, yaw: 0, health: 100, bustT: 0, fig, phase: 0 };
    this.cops.push(cop);
    return cop;
  }

  removeCar(entry) {
    this.G.scene.remove(entry.car.group);
    const i = this.cars.indexOf(entry);
    if (i >= 0) this.cars.splice(i, 1);
  }

  removeCop(cop) {
    if (cop.fig) this.G.scene.remove(cop.fig.group);
    const i = this.cops.indexOf(cop);
    if (i >= 0) this.cops.splice(i, 1);
  }

  buildHeli() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.4, metalness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 6.5), bodyMat);
    body.castShadow = true;
    g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5), bodyMat);
    tail.position.set(0, 0.3, -5);
    g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }));
    rotor.position.y = 1.1;
    g.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.5), rotor.material);
    tailRotor.position.set(0.4, 0.4, -7.2);
    g.add(tailRotor);
    // Searchlight: a spotlight + a bright disc on the ground.
    const spot = new THREE.SpotLight(0xfff2b0, 900, 90, 0.32, 0.45, 1.2);
    spot.position.set(0, -0.5, 0);
    g.add(spot);
    g.add(spot.target);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(5, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -29;
    g.add(disc);
    this.G.scene.add(g);
    return { group: g, rotor, tailRotor, spot, disc, x: 0, z: 0 };
  }

  update(dt, time) {
    const G = this.G;
    const wanted = this.wantedCount();
    const player = G.player;
    const now = G.state.time;

    // Spawn / despawn to match the wanted level.
    if (wanted === 0) {
      this.reset();
      return;
    }
    const wantCars = Math.min(wanted, 4);
    while (this.cars.length < wantCars) this.spawnCar();
    while (this.cars.length > wantCars) this.removeCar(this.cars[0]);
    const wantCops = Math.min(wanted, 3);
    while (this.cops.length < wantCops) this.spawnCop();
    while (this.cops.length > wantCops) this.removeCop(this.cops[0]);
    if (wanted >= 4 && !this.heli) {
      this.heli = this.buildHeli();
      this.heli.x = player.x + 20;
      this.heli.z = player.z - 20;
    }
    if (wanted < 4 && this.heli) {
      G.scene.remove(this.heli.group);
      this.heli = null;
    }

    // --- Police cars ---
    for (const c of this.cars) {
      const car = c.car;
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (c.ramCooldown > 0) c.ramCooldown -= dt;
      if (c.mode === 'APPROACH') {
        this.driveToward(car, player.x, player.z, 16, dt);
        if (dist < POLICE.standoffMax) {
          c.mode = 'STANDOFF';
          c.standoffT = 0;
        }
      } else if (c.mode === 'STANDOFF') {
        c.standoffT += dt;
        c.orbitA += dt * 0.4;
        const tx = player.x + Math.cos(c.orbitA) * 15;
        const tz = player.z + Math.sin(c.orbitA) * 15;
        this.driveToward(car, tx, tz, 10, dt);
        // RAM only after the grace, and only after a real standoff (or 4+ stars).
        const graceOver = now > this.ramAllowedAt;
        const standoffReady = c.standoffT > POLICE.ramMinStandoff || wanted >= 4;
        if (graceOver && standoffReady && c.ramCooldown <= 0 && dist < 26) {
          c.mode = 'RAM';
        }
      } else if (c.mode === 'RAM') {
        this.driveToward(car, player.x, player.z, 24, dt);
        if (dist < 3.1) {
          // Hit the player: damage + shake + a short cooldown, then back off.
          player.health = Math.max(0, player.health - 12);
          G.effects.shake(0.7);
          G.effects.damageFlash();
          G.effects.burst(player.x, 1.2, player.z, 0xff5544, 12, 5);
          G.state.wantedHeat = Math.min(WANTED.maxHeat, G.state.wantedHeat + 4);
          c.mode = 'APPROACH';
          c.standoffT = 0;
          c.ramCooldown = 3;
        }
        if (now <= this.ramAllowedAt) {
          // Grace re-asserted (another punch): fall back immediately.
          c.mode = 'STANDOFF';
          c.standoffT = 0;
        }
      }
      car.updateLights(time, G.daynight.nightF);
      // Siren wail when close.
      const near = dist < 60;
      G.audio.siren(wanted > 0 && near);
    }

    // --- Foot cops: chase on foot, slower than a sprinting player ---
    for (const cop of [...this.cops]) {
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      const speed = 4.5;
      cop.yaw = Math.atan2(dx, dz);
      cop.x += Math.sin(cop.yaw) * speed * dt;
      cop.z += Math.cos(cop.yaw) * speed * dt;
      const fixed = G.city.resolveCircle(cop.x, cop.z, 0.6);
      cop.x = fixed.x;
      cop.z = fixed.z;
      if (cop.fig) {
        cop.phase += speed * dt * 2.4;
        const s = Math.sin(cop.phase);
        cop.fig.legL.rotation.x = s * 0.6;
        cop.fig.legR.rotation.x = -s * 0.6;
        cop.fig.armL.rotation.x = -s * 0.5;
        cop.fig.armR.rotation.x = s * 0.5;
        cop.fig.group.position.set(cop.x, 0, cop.z);
        cop.fig.group.rotation.y = cop.yaw;
      }
      if (dist < POLICE.footBustDist) {
        cop.bustT += dt;
        if (cop.bustT > POLICE.footBustTime) {
          G.onBusted();
          return;
        }
      } else {
        cop.bustT = 0;
      }
    }

    // --- Busted by a cop car: close and slow for 2 s ---
    let closeSlow = false;
    for (const c of this.cars) {
      const d = Math.hypot(player.x - c.car.x, player.z - c.car.z);
      const pSpeed = player.onFoot ? player.speed : Math.abs(player.car ? player.car.speed : 0);
      if (d < POLICE.bustDist && pSpeed < 1) closeSlow = true;
    }
    if (closeSlow) {
      this.bustT += dt;
      if (this.bustT > POLICE.bustTime) {
        G.onBusted();
        return;
      }
    } else {
      this.bustT = 0;
    }

    // --- Helicopter follows overhead with its searchlight ---
    if (this.heli) {
      const h = this.heli;
      h.x += (player.x - h.x) * Math.min(1, dt * 0.7);
      h.z += (player.z - h.z) * Math.min(1, dt * 0.7);
      h.group.position.set(h.x, 30, h.z);
      h.group.rotation.y += dt * 0.4;
      h.rotor.rotation.y += dt * 22;
      h.tailRotor.rotation.x += dt * 30;
      h.spot.target.position.set(player.x - h.x, -30, player.z - h.z);
      h.disc.position.set(player.x - h.x, -29.5, player.z - h.z);
    }
  }

  driveToward(car, tx, tz, maxSpeed, dt) {
    const dx = tx - car.x;
    const dz = tz - car.z;
    const targetYaw = Math.atan2(dx, dz);
    const dy = normAngle(targetYaw - car.yaw);
    car.yaw += THREE.MathUtils.clamp(dy, -2.4 * dt, 2.4 * dt);
    car.speed += THREE.MathUtils.clamp(maxSpeed - car.speed, -CAR.brake * dt, CAR.accel * dt);
    const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
    const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    const fixed = this.G.city.resolveCircle(nx, nz, CAR.radius);
    if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) {
      car.speed *= 0.4;
      // Nudge the heading so the car slides around the obstacle.
      car.yaw += 0.6 * dt;
    }
    car.x = fixed.x;
    car.z = fixed.z;
    car.sync();
    car.spinWheels(dt);
  }
}
