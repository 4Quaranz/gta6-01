// SUNPORT v3 — particles, camera shake, damage flash, punch swoosh.
import * as THREE from 'three';

const MAX_PARTICLES = 320;

export class Effects {
  constructor(G) {
    this.G = G;
    this.trauma = 0;
    this.flashEl = document.getElementById('damage-flash');
    this.flash = 0;
    // One Points cloud reused for every burst (sparks, dust, muzzle smoke).
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) this.positions[i * 3 + 1] = -999;
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.32,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    G.scene.add(this.points);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.cursor = 0;
    // Punch swoosh: a flat ring that pops out and fades.
    const swooshGeo = new THREE.TorusGeometry(0.85, 0.05, 6, 24, Math.PI * 1.2);
    const swooshMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.swoosh = new THREE.Mesh(swooshGeo, swooshMat);
    this.swoosh.visible = false;
    G.scene.add(this.swoosh);
    this.swooshT = 0;
  }

  burst(x, y, z, color, count = 14, speed = 5) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * s;
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.colors[i * 3] = c.r;
      this.colors[i * 3 + 1] = c.g;
      this.colors[i * 3 + 2] = c.b;
      this.life[i] = 0.5 + Math.random() * 0.4;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  swooshAt(x, y, z, yaw) {
    this.swoosh.position.set(x, y, z);
    this.swoosh.rotation.set(Math.PI / 2 - 0.4, 0, yaw);
    this.swoosh.visible = true;
    this.swooshT = 0.28;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  damageFlash() {
    this.flash = 0.55;
    if (this.flashEl) this.flashEl.style.opacity = String(this.flash);
  }

  shakeOffset(dt) {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    return {
      x: (Math.random() * 2 - 1) * 0.35 * s,
      y: (Math.random() * 2 - 1) * 0.3 * s,
    };
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -999;
        continue;
      }
      this.vel[i * 3 + 1] -= 9.8 * dt * 0.6;
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.positions[i * 3 + 1] < 0.05) {
        this.positions[i * 3 + 1] = 0.05;
        this.vel[i * 3 + 1] *= -0.3;
      }
    }
    if (any) this.points.geometry.attributes.position.needsUpdate = true;
    if (this.swooshT > 0) {
      this.swooshT -= dt;
      const k = 1 - this.swooshT / 0.28;
      this.swoosh.scale.setScalar(1 + k * 0.9);
      this.swoosh.material.opacity = Math.max(0, 0.85 * (1 - k));
      if (this.swooshT <= 0) this.swoosh.visible = false;
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 1.4);
      if (this.flashEl) this.flashEl.style.opacity = String(this.flash);
    }
  }
}
