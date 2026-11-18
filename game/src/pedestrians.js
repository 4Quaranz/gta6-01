// SUNPORT v2 — pedestrians who actually walk. Walkers patrol the sidewalk
// loop around their block with a real walk cycle (arms and legs swinging),
// joggers run the beach path, sitters relax on the sand, and everyone
// flees when a punch lands or a gun goes off nearby.

import * as THREE from 'three';
import { ROADS_X, ROADS_Z, ROAD_W, SIDEWALK_W, SPEEDS, WORLD } from './config.js';
import { buildAvatar, poseWalk } from './player.js';

const SKINS = [0xc98e6a, 0x8a5a3b, 0xe8b88a, 0x6a4a2f, 0xd8a070];
const SHIRTS = [0xd84a4a, 0x4a8ad8, 0x4ad88a, 0xe8d84a, 0x9a4ad8, 0xf2f2f2, 0x2a2a2a, 0xff8a3a];
const PANTS = [0x2a2f38, 0x4a3a2a, 0x3a4a5a, 0x6a6a6a];
const HAIRS = [0x1a1a1a, 0x4a2a1a, 0x8a8a8a, 0xd8b25a, 0x6a3a1a];

export class Pedestrians {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.list = [];
    this.danger = null; // {x, z, until} — set by combat, makes peds flee
    // 36 walkers on sidewalk loops around blocks.
    for (let i = 0; i < 36; i++) this.spawnWalker(rng);
    // 10 beachgoers: some strolling the sand, some sitting under umbrellas.
    for (let i = 0; i < 10; i++) this.spawnBeach(rng);
  }

  // The sidewalk loop around block (i, j): a rectangle hugging the
  // sidewalk centre, 7.75 m out from each road centre line.
  blockLoop(i, j) {
    const o = ROAD_W / 2 + SIDEWALK_W / 2 + 0.25;
    const x0 = ROADS_X[i] + o;
    const x1 = ROADS_X[i + 1] - o;
    const z0 = ROADS_Z[j] + o;
    const z1 = ROADS_Z[j + 1] - o;
    return [
      { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
    ];
  }

  makeFigure() {
    const rng = this.rng;
    // A different face for every pedestrian: smile, narrow eyes, glasses,
    // mustache, sleepy — and one in ten wears sunglasses.
    const faces = [0, 1, 2, 3, 5, 7];
    const face = rng.next() < 0.1 ? 4 : rng.pick(faces);
    const fig = buildAvatar({
      skin: rng.pick(SKINS),
      shirt: rng.pick(SHIRTS),
      pants: rng.pick(PANTS),
      hair: rng.pick(HAIRS),
      face,
    });
    // One in three wears a hat.
    if (rng.next() < 0.33) {
      const hat = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.1, 0.42),
        new THREE.MeshStandardMaterial({ color: rng.pick([0xffd24a, 0xf2f2f2, 0x3a6a8a]), roughness: 0.8 }),
      );
      hat.position.set(0, 0.36, 0);
      fig.head.add(hat);
    }
    return fig;
  }

  spawnWalker(rng) {
    const i = rng.int(0, ROADS_X.length - 2);
    const j = rng.int(0, ROADS_Z.length - 2);
    const loop = this.blockLoop(i, j);
    const corner = rng.int(0, 3);
    const p = loop[corner];
    const jog = rng.next() < 0.18;
    const fig = this.makeFigure();
    const scale = 0.94 + rng.next() * 0.12;
    fig.group.scale.setScalar(scale);
    this.scene.add(fig.group);
    this.list.push({
      fig, x: p.x, z: p.z, yaw: 0,
      mode: jog ? 'jog' : 'walk',
      speed: jog ? SPEEDS.pedJog : SPEEDS.pedWalk * rng.range(0.8, 1.25),
      loop, corner, dir: rng.next() < 0.5 ? 1 : -1,
      phase: rng.next() * 6.28,
      scaredT: 0, fleeX: 0, fleeZ: 0,
    });
  }

  spawnBeach(rng) {
    const fig = this.makeFigure();
    const scale = 0.94 + rng.next() * 0.12;
    fig.group.scale.setScalar(scale);
    this.scene.add(fig.group);
    const sit = rng.next() < 0.5;
    this.list.push({
      fig,
      x: rng.range(200, 222),
      z: rng.range(-120, 160),
      yaw: rng.range(0, Math.PI * 2),
      mode: sit ? 'sit' : 'walk',
      speed: SPEEDS.pedWalk * 0.9,
      loop: null, corner: 0, dir: 1,
      phase: rng.next() * 6.28,
      scaredT: 0, fleeX: 0, fleeZ: 0,
      strollDir: rng.next() < 0.5 ? 1 : -1,
    });
  }

  scare(x, z, radius) {
    this.danger = { x, z, radius, until: 0 };
    for (const p of this.list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.scaredT = 3;
        p.mode = 'flee';
        p.fleeX = p.x - x;
        p.fleeZ = p.z - z;
        const l = Math.hypot(p.fleeX, p.fleeZ) || 1;
        p.fleeX /= l;
        p.fleeZ /= l;
      }
    }
  }

  nearest(x, z, r) {
    let best = null;
    let bd = r;
    for (const p of this.list) {
      if (p.mode === 'sit') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // Knock a pedestrian down: they stagger back and stay down briefly.
  knock(p, fromX, fromZ, power) {
    const dx = p.x - fromX;
    const dz = p.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    p.x += (dx / l) * power * 0.4;
    p.z += (dz / l) * power * 0.4;
    p.staggerT = 0.7;
    p.scaredT = 3;
    p.mode = 'flee';
    p.fleeX = dx / l;
    p.fleeZ = dz / l;
  }

  update(dt, ctx) {
    for (const p of this.list) {
      if (p.staggerT > 0) p.staggerT = Math.max(0, p.staggerT - dt);
      if (p.scaredT > 0) p.scaredT = Math.max(0, p.scaredT - dt);
      const f = p.fig;
      if (p.mode === 'sit') {
        // Seated on the sand: knees up, slight breathing, looks around.
        f.legL.rotation.x = -1.35;
        f.legR.rotation.x = -1.35;
        f.armL.rotation.x = -0.5;
        f.armR.rotation.x = -0.5;
        f.torso.rotation.x = 0.18;
        f.torso.position.y = 0.95;
        f.head.rotation.y = Math.sin(ctx.time * 0.4 + p.phase) * 0.5;
        // A sitter stands up now and then and strolls off.
        if (Math.random() < dt * 0.02) p.mode = 'walk';
        f.group.position.set(p.x, 0, p.z);
        f.group.rotation.y = p.yaw;
        continue;
      }
      if (p.mode === 'flee') {
        p.x += p.fleeX * SPEEDS.pedFlee * dt;
        p.z += p.fleeZ * SPEEDS.pedFlee * dt;
        p.yaw = Math.atan2(p.fleeX, p.fleeZ);
        p.phase += dt * SPEEDS.pedFlee * 2.4;
        poseWalk(f, p.phase, 0.95, 0.16);
        if (p.scaredT <= 0) {
          p.mode = 'walk';
          // Pick up a fresh loop near where they ended up.
          const i = Math.max(0, Math.min(ROADS_X.length - 2, Math.floor((p.x + 160) / 40)));
          const j = Math.max(0, Math.min(ROADS_Z.length - 2, Math.floor((p.z + 160) / 40)));
          p.loop = this.blockLoop(i, j);
          p.corner = 0;
        }
        // Keep them on land.
        p.x = Math.max(-225, Math.min(224, p.x));
        p.z = Math.max(-225, Math.min(245, p.z));
        f.group.position.set(p.x, 0, p.z);
        f.group.rotation.y = p.yaw;
        continue;
      }
      // Walk / jog along the loop, or stroll the beach.
      let tx;
      let tz;
      if (p.loop) {
        const next = p.loop[(p.corner + p.dir + 4) % 4];
        tx = next.x;
        tz = next.z;
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          p.corner = (p.corner + p.dir + 4) % 4;
        } else {
          const step = Math.min(d, p.speed * dt);
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
          p.yaw = Math.atan2(dx, dz);
        }
      } else {
        // Beach stroll: along the sand, turn at the ends.
        p.z += p.strollDir * p.speed * dt;
        if (p.z > 170) p.strollDir = -1;
        if (p.z < -130) p.strollDir = 1;
        p.yaw = p.strollDir > 0 ? 0 : Math.PI;
        tx = p.x;
        tz = p.z;
      }
      const running = p.mode === 'jog';
      p.phase += dt * p.speed * 2.1;
      poseWalk(f, p.phase, running ? 0.95 : 0.6, running ? 0.15 : 0.04);
      if (p.staggerT > 0) f.torso.rotation.x -= 0.3 * (p.staggerT / 0.7);
      f.group.position.set(p.x, 0, p.z);
      f.group.rotation.y = p.yaw;
    }
  }
}
