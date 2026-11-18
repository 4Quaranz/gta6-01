// SUNPORT v2 — screen effects: punch swoosh arcs, hit bursts, muzzle
// flashes and camera shake. Everything is a pooled mesh so nothing is
// allocated during play.

import * as THREE from 'three';

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.glowTex = makeGlowTexture();
    this.swooshes = [];
    this.bursts = [];
    this.flashes = [];
    this.shakeAmt = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    // Reusable swoosh arc: a flat ring segment that faces the camera.
    this.swooshGeo = new THREE.TorusGeometry(0.9, 0.07, 6, 12, Math.PI * 0.9);
    this.swooshMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.swooshGeo, this.swooshMat.clone());
      m.visible = false;
      scene.add(m);
      this.swooshes.push({ mesh: m, t: 1 });
    }
    // Particle bursts: small additive sprites.
    this.burstGeo = new THREE.PlaneGeometry(0.16, 0.16);
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd24a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(this.burstGeo, mat);
      m.visible = false;
      scene.add(m);
      this.bursts.push({ mesh: m, t: 1, vx: 0, vy: 0, vz: 0 });
    }
    // Muzzle / impact flashes: glow sprites.
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xffe9a8, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      s.scale.set(1.4, 1.4, 1);
      scene.add(s);
      this.flashes.push({ sprite: s, t: 1 });
    }
  }

  // A curved white arc at the fist, swinging forward — the visible punch.
  swoosh(pos, yaw) {
    const s = this.swooshes.find((x) => x.t >= 1) || this.swooshes[0];
    s.mesh.position.set(pos.x, pos.y, pos.z);
    s.mesh.rotation.set(0.4, yaw, -0.6);
    s.mesh.visible = true;
    s.t = 0;
  }

  // A burst of sparks at a hit point.
  burst(pos, color, n) {
    let made = 0;
    for (const b of this.bursts) {
      if (made >= (n || 8)) break;
      if (b.t < 1) continue;
      b.mesh.position.set(pos.x, pos.y, pos.z);
      b.mesh.material.color.setHex(color || 0xffd24a);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 3 + 1;
      b.vx = Math.cos(a) * 3;
      b.vz = Math.sin(a) * 3;
      b.vy = up;
      b.mesh.visible = true;
      b.t = 0;
      made++;
    }
  }

  flash(pos, scale, color) {
    const f = this.flashes.find((x) => x.t >= 1) || this.flashes[0];
    f.sprite.position.set(pos.x, pos.y, pos.z);
    f.sprite.scale.set(scale || 1.4, scale || 1.4, 1);
    f.sprite.material.color.setHex(color || 0xffe9a8);
    f.sprite.visible = true;
    f.t = 0;
  }

  shake(amount) {
    this.shakeAmt = Math.min(0.6, this.shakeAmt + amount);
  }

  update(dt) {
    for (const s of this.swooshes) {
      if (s.t >= 1) { s.mesh.visible = false; continue; }
      s.t = Math.min(1, s.t + dt / 0.16);
      s.mesh.material.opacity = 0.85 * (1 - s.t);
      s.mesh.rotation.z -= dt * 14;
      const sc = 1 + s.t * 0.5;
      s.mesh.scale.set(sc, sc, sc);
    }
    for (const b of this.bursts) {
      if (b.t >= 1) { b.mesh.visible = false; continue; }
      b.t = Math.min(1, b.t + dt / 0.45);
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
      b.vy -= 9 * dt;
      b.mesh.material.opacity = 0.9 * (1 - b.t);
      b.mesh.rotation.z += dt * 9;
    }
    for (const f of this.flashes) {
      if (f.t >= 1) { f.sprite.visible = false; continue; }
      f.t = Math.min(1, f.t + dt / 0.09);
      f.sprite.material.opacity = 0.95 * (1 - f.t);
    }
    // Camera shake decays; the main loop reads shakeX/shakeY.
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    const a = this.shakeAmt * this.shakeAmt * 0.35;
    this.shakeX = (Math.random() * 2 - 1) * a;
    this.shakeY = (Math.random() * 2 - 1) * a;
  }
}
