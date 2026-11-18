// SUNPORT v2 — combat. A punch is a timed swing: the fist lands 0.14 s
// into the 0.45 s animation, only on targets inside range and inside the
// swing arc. A hit staggers the target, throws them back, raises the
// wanted level and makes nearby pedestrians flee — and tells the police
// to hold off ramming. Shooting is hitscan from the camera with a
// magazine and a timed reload.

import * as THREE from 'three';
import { COMBAT, WANTED, angleDelta } from './config.js';

export class Combat {
  constructor(audio, effects) {
    this.audio = audio;
    this.effects = effects;
    this.reloading = false;
    this.reloadT = 0;
    this.fireCooldown = 0;
  }

  tryPunch(player) {
    if (!player.startPunch()) return false;
    this.audio.swoosh();
    const fx = player.x + Math.sin(player.yaw) * 1.4;
    const fz = player.z + Math.cos(player.yaw) * 1.4;
    this.effects.swoosh({ x: fx, y: 1.3, z: fz }, player.yaw);
    return true;
  }

  // Resolve the punch at the moment the fist lands.
  resolvePunch(player, ctx) {
    const px = player.x;
    const pz = player.z;
    const inArc = (tx, tz) => {
      const d = Math.hypot(tx - px, tz - pz);
      if (d > COMBAT.punchRange) return null;
      const ang = Math.atan2(tx - px, tz - pz);
      if (Math.abs(angleDelta(ang, player.yaw)) > COMBAT.punchArc) return null;
      return d;
    };
    // Foot cops first — punching the law costs more.
    let hitCop = null;
    let hitCopD = Infinity;
    for (const cop of ctx.police.cops) {
      const d = inArc(cop.x, cop.z);
      if (d !== null && d < hitCopD) { hitCopD = d; hitCop = cop; }
    }
    if (hitCop) {
      hitCop.health -= COMBAT.punchDamage;
      hitCop.staggerT = 0.7;
      const dx = hitCop.x - px;
      const dz = hitCop.z - pz;
      const l = Math.hypot(dx, dz) || 1;
      hitCop.x += (dx / l) * COMBAT.punchKnock * 0.35;
      hitCop.z += (dz / l) * COMBAT.punchKnock * 0.35;
      this.landHit(player, ctx, hitCop.x, hitCop.z, WANTED.punchCop, 'cop');
      if (hitCop.health <= 0) {
        ctx.police.removeCop(hitCop);
      }
      return 'cop';
    }
    // Then pedestrians.
    const ped = ctx.pedestrians.nearest(px, pz, COMBAT.punchRange);
    if (ped) {
      const d = inArc(ped.x, ped.z);
      if (d !== null) {
        ctx.pedestrians.knock(ped, px, pz, COMBAT.punchKnock);
        this.landHit(player, ctx, ped.x, ped.z, WANTED.punchPed, 'ped');
        return 'ped';
      }
    }
    return null;
  }

  landHit(player, ctx, tx, tz, heat, kind) {
    this.audio.punch();
    this.effects.burst({ x: tx, y: 1.2, z: tz }, 0xffd24a, 14);
    ctx.state.wantedHeat = Math.min(100, ctx.state.wantedHeat + heat);
    ctx.state.lastCrimeT = ctx.time;
    ctx.police.onPunch(ctx.time);
    ctx.pedestrians.scare(tx, tz, 16);
    if (ctx.onShake) ctx.onShake(0.25);
    return kind;
  }

  shoot(player, ctx) {
    if (player.weapon !== 'pistol' || player.mag <= 0 || this.reloading) return false;
    if (this.fireCooldown > 0) return false;
    this.fireCooldown = 0.18;
    player.mag -= 1;
    this.audio.gunshot();
    ctx.state.wantedHeat = Math.min(100, ctx.state.wantedHeat + WANTED.shoot);
    ctx.state.lastCrimeT = ctx.time;
    ctx.pedestrians.scare(player.x, player.z, 20);
    // Hitscan along the camera forward.
    const cam = ctx.camera;
    const origin = new THREE.Vector3();
    cam.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const muzzle = new THREE.Vector3(player.x, 1.4, player.z).add(new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(0.8));
    this.effects.flash({ x: muzzle.x, y: muzzle.y, z: muzzle.z }, 1.6);
    let best = null;
    let bestD = COMBAT.pistolRange;
    const test = (tx, tz, ty, radius, ref) => {
      const to = new THREE.Vector3(tx - origin.x, ty - origin.y, tz - origin.z);
      const d = to.length();
      if (d > bestD) return;
      to.normalize();
      const dot = to.dot(dir);
      if (dot > 0.998) { bestD = d; best = ref; }
    };
    for (const ped of ctx.pedestrians.list) test(ped.x, ped.z, 1.2, 0.8, { kind: 'ped', ref: ped });
    for (const cop of ctx.police.cops) test(cop.x, cop.z, 1.2, 0.8, { kind: 'cop', ref: cop });
    for (const car of ctx.police.cars) test(car.x, car.z, 1.0, 2.0, { kind: 'car', ref: car });
    if (best) {
      const tx = best.ref.x;
      const tz = best.ref.z;
      this.effects.burst({ x: tx, y: 1.2, z: tz }, 0xff5544, 18);
      if (best.kind === 'ped') ctx.pedestrians.knock(best.ref, player.x, player.z, 8);
      if (best.kind === 'cop') {
        best.ref.health -= COMBAT.pistolDamage;
        best.ref.staggerT = 0.8;
        if (best.ref.health <= 0) ctx.police.removeCop(best.ref);
      }
      if (best.kind === 'car') ctx.state.wantedHeat = Math.min(100, ctx.state.wantedHeat + 6);
    } else {
      // Tracer into the distance: a short-lived spark where the ray ends.
      const end = origin.clone().add(dir.clone().multiplyScalar(40));
      this.effects.burst({ x: end.x, y: Math.max(0.5, end.y), z: end.z }, 0xffd24a, 6);
    }
    if (ctx.onShake) ctx.onShake(0.12);
    return true;
  }

  startReload(player) {
    if (player.weapon !== 'pistol' || this.reloading) return false;
    if (player.mag >= COMBAT.magSize || player.reserve <= 0) return false;
    this.reloading = true;
    this.reloadT = 1.2;
    this.audio.reload();
    return true;
  }

  update(dt, player) {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = COMBAT.magSize - player.mag;
        const take = Math.min(need, player.reserve);
        player.mag += take;
        player.reserve -= take;
        this.reloading = false;
      }
    }
    // Resolve the punch at the fist-landing moment (0.14 s in).
    if (player.punchT > 0 && !player.punchDidHit) {
      if (player.punchT <= 0.45 - COMBAT.punchHitAt) {
        player.punchDidHit = true;
        this._pendingResolve = player;
      }
    }
  }

  // Called by main each frame after update(): resolves a punch that
  // landed this frame, with the full context available.
  resolvePending(ctx) {
    if (this._pendingResolve) {
      const p = this._pendingResolve;
      this._pendingResolve = null;
      this.resolvePunch(p, ctx);
    }
  }
}
