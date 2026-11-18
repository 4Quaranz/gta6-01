// SUNPORT — pedestrians.
// Sunny-sidewalk walkers in bright shirts, now varied: skin tones, hair
// colours, caps and hats, some jogging, some strolling the beach, a few
// sitting under umbrellas. They stroll the sidewalks, and when a shot
// rings out, a punch lands or a car bears down on them nearby, they run
// away screaming (well, fleeing) for a few seconds.
import * as THREE from 'three';
import { CFG } from './config.js';

const SHIRTS = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da, 0xfcbad3, 0xff9f43, 0x2ed573, 0x70a1ff];
const SKINS = [0xd9a077, 0xc98e6b, 0x8a5a3b, 0xf0c8a0, 0x6b4423, 0xe8b88a];
const HAIRS = [0x222222, 0x5a3a1a, 0xd8d8d8, 0x8a5a2a, 0xffd24a, 0x2a4a8a];
const PANTS = [0x333a45, 0x2a3242, 0x5a4a6a, 0x8a7a5a, 0x3a5a7a, 0xe8e8e8];

export function createPedMesh(color, rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: rng ? rng.pick(PANTS) : 0x333a45 });
  const skin = new THREE.MeshLambertMaterial({ color: rng ? rng.pick(SKINS) : 0xd9a077 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.4), shirt);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.85;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.32), pants);
  legL.position.set(-0.17, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.17;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.28), shirt);
  armL.position.set(-0.48, 1.15, 0);
  const armR = armL.clone();
  armR.position.x = 0.48;
  g.add(torso, head, legL, legR, armL, armR);
  g.userData.legs = [legL, legR];
  g.userData.arms = [armL, armR];
  if (rng) {
    const roll = rng.next();
    if (roll < 0.35) {
      // Cap.
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10),
        new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) }),
      );
      cap.position.y = 2.06;
      g.add(cap);
    } else if (roll < 0.6) {
      // Hair.
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.27, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: rng.pick(HAIRS) }),
      );
      hair.position.y = 1.88;
      g.add(hair);
    } else if (roll < 0.7) {
      // Sun hat.
      const hat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10),
        new THREE.MeshLambertMaterial({ color: 0xf2e6c9 }),
      );
      hat.position.y = 2.04;
      g.add(hat);
    }
  }
  return g;
}

export function spawnPedestrians(scene, rng) {
  const peds = [];
  for (let i = 0; i < CFG.pedCount; i += 1) {
    const alongZ = rng.next() < 0.5;
    const street = rng.pick(CFG.streets);
    const side = rng.pick([-9, 9]);
    const pos = rng.range(-170, 170);
    const jogging = rng.next() < 0.18;
    const ped = {
      x: alongZ ? street + side : pos,
      z: alongZ ? pos : street + side,
      heading: rng.range(0, Math.PI * 2),
      alongZ, street, side,
      dir: rng.pick([-1, 1]),
      speed: jogging ? 3.4 : CFG.pedWalkSpeed,
      jogging,
      sitting: false,
      fleeT: 0, fleeX: 0, fleeZ: 0,
      hp: 50, alive: true, phase: rng.range(0, 6),
      mesh: createPedMesh(rng.pick(SHIRTS), rng),
    };
    ped.mesh.position.set(ped.x, 0, ped.z);
    scene.add(ped.mesh);
    peds.push(ped);
  }
  // Beach crowd on Solmar Beach: strollers along the sand and sitters
  // under the umbrellas.
  for (let i = 0; i < CFG.beachPedCount; i += 1) {
    const sitting = i % 3 === 0;
    const ped = {
      x: CFG.beachX + rng.range(8, 34),
      z: rng.range(-160, 160),
      heading: rng.range(0, Math.PI * 2),
      alongZ: true, street: CFG.beachX + 20, side: 0,
      dir: rng.pick([-1, 1]),
      speed: sitting ? 0 : 1.2,
      jogging: false,
      sitting,
      fleeT: 0, fleeX: 0, fleeZ: 0,
      hp: 50, alive: true, phase: rng.range(0, 6),
      mesh: createPedMesh(rng.pick(SHIRTS), rng),
    };
    if (sitting) {
      ped.mesh.position.set(ped.x, -0.25, ped.z);
      ped.mesh.rotation.x = 0.35;
    } else {
      ped.mesh.position.set(ped.x, 0, ped.z);
    }
    scene.add(ped.mesh);
    peds.push(ped);
  }
  return peds;
}

// A scare at (x, z): everyone within 25 m runs away from it.
export function scarePeds(peds, x, z, radius = 25) {
  for (const p of peds) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < radius) {
      p.fleeT = 3 + Math.random() * 2;
      p.fleeX = x; p.fleeZ = z;
    }
  }
}

export function stepPedestrians(peds, dt, city, player) {
  for (const p of peds) {
    if (!p.alive) continue;
    let vx = 0; let vz = 0;
    if (p.fleeT > 0) {
      p.fleeT -= dt;
      const dx = p.x - p.fleeX;
      const dz = p.z - p.fleeZ;
      const d = Math.hypot(dx, dz) || 1;
      vx = (dx / d) * CFG.pedFleeSpeed;
      vz = (dz / d) * CFG.pedFleeSpeed;
    } else if (!p.sitting) {
      // Stroll along the sidewalk (or the sand); reverse at the map edge.
      if (p.alongZ) {
        vz = p.dir * p.speed;
        if (p.z > 172 || p.z < -172) p.dir *= -1;
      } else {
        vx = p.dir * p.speed;
        if (p.x > 172 || p.x < -172) p.dir *= -1;
      }
    }
    // A car close behind also scares them off the road.
    if (player.car) {
      const d = Math.hypot(p.x - player.car.x, p.z - player.car.z);
      if (d < 6 && p.fleeT <= 0) { p.fleeT = 2; p.fleeX = player.car.x; p.fleeZ = player.car.z; }
    }
    p.x += vx * dt;
    p.z += vz * dt;
    if (!p.sitting) city.collideCircle(p, 0.5);
    const moving = Math.hypot(vx, vz);
    if (moving > 0.1) {
      p.heading = Math.atan2(vx, vz);
      p.phase += dt * moving * (p.jogging ? 2.4 : 1.8);
    }
    p.mesh.position.set(p.x, p.sitting ? -0.25 : 0, p.z);
    p.mesh.rotation.y = p.heading;
    if (p.sitting) p.mesh.rotation.x = 0.35;
    const swing = moving > 0.1 ? Math.sin(p.phase) * (p.jogging ? 0.7 : 0.5) : 0;
    p.mesh.userData.legs[0].rotation.x = swing;
    p.mesh.userData.legs[1].rotation.x = -swing;
    if (p.mesh.userData.arms) {
      p.mesh.userData.arms[0].rotation.x = -swing * 0.8;
      p.mesh.userData.arms[1].rotation.x = swing * 0.8;
    }
  }
}
