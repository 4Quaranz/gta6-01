// SUNPORT v3 — combat: punch (with stagger + police grace) and pistol
// shooting with a simple ray test, plus reload. Written fresh.
import * as THREE from 'three';
import { WANTED } from './config.js';

const PUNCH_RANGE = 2.4;
const SHOT_RANGE = 60;
const SHOT_COOLDOWN = 0.18;
const RELOAD_TIME = 1.2;
const MAG_SIZE = 12;

export class Combat {
  constructor(G) {
    this.G = G;
    this.cooldown = 0;
    this.reloadT = 0;
  }

  tryPunch(player) {
    if (!player.startPunch()) return false;
    const G = this.G;
    const now = G.state.time;
    G.audio.punch();
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    G.effects.swooshAt(player.x + fx * 1.1, 1.3, player.z + fz * 1.1, player.yaw);
    // A punch always buys the no-ram grace, hit or whiff.
    G.police.onPunch(now);
    G.state.wantedHeat = Math.min(WANTED.maxHeat, G.state.wantedHeat + WANTED.punchHeat);
    G.state.lastCrimeT = now;
    // Nearest pedestrian in front gets staggered and flees.
    const ped = G.pedestrians.staggerAt(player.x + fx * 1.4, player.z + fz * 1.4, PUNCH_RANGE);
    if (ped) {
      G.effects.burst(ped.x, 1.2, ped.z, 0xffcc66, 10, 4);
      G.audio.hit();
    }
    // A foot cop in range takes damage.
    for (const cop of [...G.police.cops]) {
      const d = Math.hypot(cop.x - player.x, cop.z - player.z);
      if (d < PUNCH_RANGE) {
        cop.health -= 34;
        G.effects.burst(cop.x, 1.2, cop.z, 0xff5544, 12, 5);
        G.audio.hit();
        if (cop.health <= 0) {
          G.police.removeCop(cop);
          G.state.wantedHeat = Math.min(WANTED.maxHeat, G.state.wantedHeat + WANTED.killHeat);
        }
        break;
      }
    }
    // A car in front gets dented (shake + sparks).
    const car = G.vehicles.nearestCar(player.x + fx * 1.6, player.z + fz * 1.6, 2.2);
    if (car && !ped) {
      G.effects.burst(car.x, 1.0, car.z, 0xffcc66, 8, 4);
      G.audio.hit();
    }
    return true;
  }

  shoot(player) {
    const G = this.G;
    if (player.weapon !== 'pistol' || !player.hasPistol) return false;
    if (this.cooldown > 0 || this.reloadT > 0) return false;
    if (player.mag <= 0) {
      // Dry fire: no auto-reload — the player presses R to reload.
      G.audio.click();
      return false;
    }
    this.cooldown = SHOT_COOLDOWN;
    player.mag -= 1;
    G.audio.shoot();
    G.effects.shake(0.12);
    // Muzzle flash at the gun.
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    G.effects.burst(player.x + fx * 0.8, 1.45, player.z + fz * 0.8, 0xffe9a8, 6, 3);
    // Ray from the player through the camera's aim direction.
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    const ox = player.x;
    const oy = 1.5;
    const oz = player.z;
    let best = null;
    let bestT = SHOT_RANGE;
    const testPoint = (x, y, z, radius, ref) => {
      const dx = x - ox;
      const dy = y - oy;
      const dz = z - oz;
      const t = dx * dir.x + dy * dir.y + dz * dir.z;
      if (t < 0.5 || t > bestT) return;
      const px = ox + dir.x * t;
      const py = oy + dir.y * t;
      const pz = oz + dir.z * t;
      const miss = Math.hypot(x - px, y - py, z - pz);
      if (miss < radius) {
        bestT = t;
        best = { ref, x: px, y: py, z: pz, t };
      }
    };
    for (const p of G.pedestrians.list) testPoint(p.x, 1.1, p.z, 1.1, { kind: 'ped', ped: p });
    for (const cop of G.police.cops) testPoint(cop.x, 1.1, cop.z, 1.1, { kind: 'cop', cop });
    for (const car of G.vehicles.parked) testPoint(car.x, 0.9, car.z, 1.6, { kind: 'car', car });
    for (const t of G.vehicles.traffic) testPoint(t.car.x, 0.9, t.car.z, 1.6, { kind: 'car', car: t.car });
    for (const c of G.police.cars) testPoint(c.car.x, 0.9, c.car.z, 1.6, { kind: 'copcar', car: c.car });
    if (best) {
      G.effects.burst(best.x, best.y, best.z, 0xff5544, 12, 5);
      if (best.ref.kind === 'ped') {
        G.pedestrians.staggerAt(best.ref.ped.x, best.ref.ped.z, 0.5);
        G.pedestrians.fleeFrom(player.x, player.z, 18);
      } else if (best.ref.kind === 'cop') {
        best.ref.cop.health -= 34;
        if (best.ref.cop.health <= 0) {
          G.police.removeCop(best.ref.cop);
          G.state.wantedHeat = Math.min(WANTED.maxHeat, G.state.wantedHeat + WANTED.killHeat);
        }
      }
      G.audio.hit();
    } else {
      // Impact dust where the shot lands.
      const hx = ox + dir.x * 40;
      const hz = oz + dir.z * 40;
      G.effects.burst(hx, 0.4, hz, 0xcccccc, 5, 2);
    }
    G.state.wantedHeat = Math.min(WANTED.maxHeat, G.state.wantedHeat + WANTED.shotHeat);
    G.state.lastCrimeT = G.state.time;
    G.pedestrians.fleeFrom(player.x, player.z, 20);
    return true;
  }

  startReload(player) {
    if (this.reloadT > 0 || player.mag >= MAG_SIZE || player.reserve <= 0) return false;
    this.reloadT = RELOAD_TIME;
    return true;
  }

  update(dt, player) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = MAG_SIZE - player.mag;
        const take = Math.min(need, player.reserve);
        player.mag += take;
        player.reserve -= take;
        this.reloadT = 0;
      }
    }
  }
}
