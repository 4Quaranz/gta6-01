// SUNPORT — particles, screen shake and the damage flash.
// One pooled set of small glowing sprites is reused for muzzle flashes,
// crash sparks and pickup sparkles, so the hot loop never allocates.
import * as THREE from 'three';

export function createEffects(scene) {
  const pool = [];
  const geo = new THREE.PlaneGeometry(0.5, 0.5);
  for (let i = 0; i < 60; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffcc55, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    scene.add(m);
    pool.push({ mesh: m, vx: 0, vy: 0, vz: 0, t: 0, life: 1 });
  }
  let next = 0;
  const fx = {
    shake: 0,
    shakeMax: 0,
    addShake(amount) { fx.shake = Math.min(0.6, fx.shake + amount); },
    burst(x, y, z, color, count, speed = 6) {
      for (let i = 0; i < count; i += 1) {
        const p = pool[next];
        next = (next + 1) % pool.length;
        p.mesh.visible = true;
        p.mesh.position.set(x, y, z);
        p.mesh.material.color.setHex(color);
        p.mesh.material.opacity = 1;
        const a = Math.random() * Math.PI * 2;
        const b = Math.random() * Math.PI - Math.PI / 2;
        p.vx = Math.cos(a) * Math.cos(b) * speed;
        p.vy = Math.abs(Math.sin(b)) * speed + 2;
        p.vz = Math.sin(a) * Math.cos(b) * speed;
        p.t = 0;
        p.life = 0.35 + Math.random() * 0.3;
      }
    },
    update(dt) {
      for (const p of pool) {
        if (!p.mesh.visible) continue;
        p.t += dt;
        if (p.t >= p.life) { p.mesh.visible = false; continue; }
        p.vy -= 12 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.material.opacity = 1 - p.t / p.life;
        p.mesh.lookAt(0, 0, 0);
      }
      if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt * 1.8);
    },
    shakeOffset() {
      if (fx.shake <= 0) return { x: 0, y: 0 };
      return {
        x: (Math.random() - 0.5) * fx.shake * 0.3,
        y: (Math.random() - 0.5) * fx.shake * 0.3,
      };
    },
  };
  return fx;
}
