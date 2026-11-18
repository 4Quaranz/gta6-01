// SUNPORT v3 — Jace Moreno on foot: walk / sprint + stamina, jump, punch
// animation, entering and leaving cars. Written fresh.
import * as THREE from 'three';
import { PLAYER, WANTED, SPOTS } from './config.js';
import { makePersonFigure } from './pedestrians.js';

const PUNCH_DUR = 0.6; // seconds; arm reaches -1.17 rad mid-swing
const GRAVITY = 24; // jump lands in ~0.62 s (jumpSpeed 7.4)

export class Player {
  constructor(G) {
    this.G = G;
    this.figure = makePersonFigure({
      skin: 0xe8b98a,
      shirt: 0x1f3a5f, // dark blue jacket
      pants: 0x2c3e50,
      hairColor: 0x1a1a1a,
      faceVariant: 0,
      hairLong: false,
    });
    G.scene.add(this.figure.group);
    this.x = SPOTS.spawn.x;
    this.z = SPOTS.spawn.z;
    this.yaw = 0; // facing +z (south, down the boulevard)
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.speed = 0;
    this.stamina = PLAYER.staminaMax;
    this.money = 120;
    this.health = 100;
    this.onFoot = true;
    this.car = null;
    this.weapon = 'fists';
    this.hasPistol = false;
    this.mag = 12;
    this.reserve = 24;
    this.punchT = 0;
    this.jumpT = 0;
    this.jumpY = 0;
    this.walkPhase = 0;
    this.reloadT = 0;
    this.sprinting = false;
    this.syncFigure();
  }

  syncFigure() {
    this.figure.group.position.set(this.x, this.jumpY, this.z);
    this.figure.group.rotation.y = this.yaw;
    this.figure.group.visible = this.onFoot;
  }

  startPunch() {
    if (!this.onFoot || this.punchT > 0) return false;
    this.punchT = PUNCH_DUR;
    return true;
  }

  startJump() {
    if (!this.onFoot || this.jumpT > 0) return false;
    this.jumpT = 0.0001;
    return true;
  }

  enterCar(car) {
    this.onFoot = false;
    this.car = car;
    car.parked = false;
    car.speed = 0;
    this.speed = 0;
    this.syncFigure();
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    // Step out on the driver's side.
    const sideX = Math.cos(car.yaw);
    const sideZ = -Math.sin(car.yaw);
    this.x = car.x + sideX * 2.2;
    this.z = car.z + sideZ * 2.2;
    const fixed = this.G.city.resolveCircle(this.x, this.z, PLAYER.radius);
    this.x = fixed.x;
    this.z = fixed.z;
    this.yaw = car.yaw;
    this.car = null;
    this.onFoot = true;
    this.speed = 0;
    this.syncFigure();
  }

  update(dt, input) {
    // Camera orbit (mouse right-drag / touch drag share these deltas).
    const d = input.takeCamDelta();
    this.camYaw -= d.x * 0.004;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + d.y * 0.003, -0.12, 0.62);

    if (!this.onFoot) {
      // Driving: position mirrors the car; the figure is hidden.
      if (this.car) {
        this.x = this.car.x;
        this.z = this.car.z;
        this.yaw = this.car.yaw;
        this.speed = Math.abs(this.car.speed);
      }
      this.syncFigure();
      return;
    }

    const ax = input.axes();
    // Input axes: y = +1 forward (W / stick up), x = +1 strafe right (D).
    const fwd = ax.y;
    const strafe = ax.x;
    const moving = Math.hypot(ax.x, ax.y) > 0.08;
    const wantSprint = input.sprint && moving && fwd > 0.1 && this.stamina > 1;
    this.sprinting = wantSprint;
    const target = wantSprint ? PLAYER.run : PLAYER.walk;
    const targetSpeed = moving ? target * Math.min(1, Math.hypot(ax.x, ax.y)) : 0;
    const rate = targetSpeed > this.speed ? PLAYER.accel : PLAYER.accel * 1.4;
    this.speed += THREE.MathUtils.clamp(targetSpeed - this.speed, -rate * dt, rate * dt);
    if (wantSprint) {
      this.stamina = Math.max(0, this.stamina - PLAYER.staminaDrain * dt);
    } else {
      this.stamina = Math.min(PLAYER.staminaMax, this.stamina + PLAYER.staminaRegen * dt);
    }

    if (moving && this.speed > 0.2) {
      // Camera-relative movement.
      const fwdX = Math.sin(this.camYaw);
      const fwdZ = Math.cos(this.camYaw);
      const rightX = Math.cos(this.camYaw);
      const rightZ = -Math.sin(this.camYaw);
      const mx = (fwdX * fwd + rightX * strafe) * this.speed * dt;
      const mz = (fwdZ * fwd + rightZ * strafe) * this.speed * dt;
      const nx = this.x + mx;
      const nz = this.z + mz;
      const fixed = this.G.city.resolveCircle(nx, nz, PLAYER.radius);
      this.x = fixed.x;
      this.z = fixed.z;
      const targetYaw = Math.atan2(mx, mz);
      let dy = targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += THREE.MathUtils.clamp(dy, -8 * dt, 8 * dt);
    }

    // Jump (tuck pose while airborne).
    if (this.jumpT > 0) {
      this.jumpT += dt;
      this.jumpY = Math.max(0, PLAYER.jumpSpeed * this.jumpT - 0.5 * GRAVITY * this.jumpT * this.jumpT);
      if (this.jumpT >= (2 * PLAYER.jumpSpeed) / GRAVITY) {
        this.jumpT = 0;
        this.jumpY = 0;
      }
    }

    // Punch animation: arm swings to -1.17 rad, torso twists, body lunges.
    if (this.punchT > 0) {
      this.punchT = Math.max(0, this.punchT - dt);
    }
    const punchK = this.punchT > 0 ? 1 - this.punchT / PUNCH_DUR : 0;
    const punchSwing = this.punchT > 0 ? Math.sin(Math.PI * Math.min(1, punchK * 1.15)) : 0;

    // Walk / run limb swing (overridden by the punch on the right arm).
    this.walkPhase += this.speed * dt * 2.1;
    const swing = this.speed > 0.2 ? Math.min(0.75, this.speed * 0.09) : 0;
    const s = Math.sin(this.walkPhase);
    const f = this.figure;
    if (this.jumpT > 0) {
      f.legL.rotation.x = -0.9;
      f.legR.rotation.x = -0.5;
      f.armL.rotation.x = -0.7;
      f.armR.rotation.x = -0.7;
    } else {
      f.legL.rotation.x = s * swing;
      f.legR.rotation.x = -s * swing;
      f.armL.rotation.x = -s * swing * 0.85;
      f.armR.rotation.x = s * swing * 0.85;
    }
    if (this.punchT > 0) {
      f.armR.rotation.x = -1.17 * punchSwing;
      f.torso.rotation.x = 0.18 * punchSwing;
      // Small lunge forward during the swing.
      const lx = Math.sin(this.yaw) * 0.35 * punchSwing * dt * 8;
      const lz = Math.cos(this.yaw) * 0.35 * punchSwing * dt * 8;
      const fixed = this.G.city.resolveCircle(this.x + lx, this.z + lz, PLAYER.radius);
      this.x = fixed.x;
      this.z = fixed.z;
    } else {
      f.torso.rotation.x = 0;
    }
    // Idle breathing when standing still.
    if (this.speed < 0.2 && this.punchT <= 0 && this.jumpT <= 0) {
      f.armL.rotation.x = Math.sin(this.G.state.time * 1.8) * 0.04;
      f.armR.rotation.x = Math.sin(this.G.state.time * 1.8) * 0.04;
    }
    this.syncFigure();
  }
}
