// SUNPORT — the wanted system and the Sunport PD.
// Heat 0..100 maps to 0..5 stars. Crimes add heat; hiding from every cop
// lets it bleed off. Police cars spawn at the map edge and ram the player;
// foot cops chase on foot, and touching Jace while he is on foot busts him.
// While the player is in a car, cops ram the car instead of busting.
// At 4 stars and up a police helicopter circles overhead, its searchlight
// pinned on the player.
import * as THREE from 'three';
import { CFG } from './config.js';
import { createCar, syncCarMesh } from './vehicles.js';
import { createPedMesh } from './pedestrians.js';

export function wantedStars(heat) {
  if (heat <= 0) return 0;
  return Math.min(5, Math.ceil(heat / 20));
}

export function addWanted(state, heat) {
  state.wantedHeat = Math.min(CFG.wantedMax, state.wantedHeat + heat);
}

export function updateWanted(state, dt) {
  const stars = wantedStars(state.wantedHeat);
  state.wanted = stars;
  // Decay only while no cop can see the player.
  const seen = state.cops.some((c) => c.alive && Math.hypot(c.x - state.player.x, c.z - state.player.z) < 45)
    || state.policeCars.some((c) => Math.hypot(c.x - state.player.x, c.z - state.player.z) < 45);
  if (!seen && state.wantedHeat > 0) {
    state.wantedHeat = Math.max(0, state.wantedHeat - CFG.wantedDecay * dt);
  }
  // Keep the pursuit sized to the stars: one patrol car per star, up to 3,
  // plus foot cops from 2 stars up.
  const wantCars = Math.min(3, stars);
  while (state.policeCars.length < wantCars) spawnPoliceCar(state);
  while (state.policeCars.length > wantCars) {
    const c = state.policeCars.pop();
    state.scene.remove(c.mesh);
  }
  const wantCops = stars >= 2 ? Math.min(3, stars - 1) : 0;
  while (state.cops.filter((c) => c.alive).length < wantCops) spawnFootCop(state);
}

function spawnPoliceCar(state) {
  const p = state.player;
  const angle = Math.random() * Math.PI * 2;
  const x = p.x + Math.cos(angle) * 60;
  const z = p.z + Math.sin(angle) * 60;
  const car = createCar(x, z, 0, 0x111111, 'police');
  car.speed = 10;
  state.scene.add(car.mesh);
  state.policeCars.push(car);
}

function spawnHeli(state) {
  const p = state.player;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a3a8a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2.4), bodyMat);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 0.8), bodyMat);
  tail.position.set(-4.5, 0.4, 0);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.2, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x9fd0e8 }),
  );
  glass.position.set(2.2, -0.2, 0);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.position.y = 1.4;
  group.add(body, tail, glass, rotor);
  group.position.set(p.x + 34, 42, p.z);
  state.scene.add(group);
  // Searchlight cone (apex at the heli, wide end on the ground) + pool.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(6, 12, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  state.scene.add(cone);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(5, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(p.x, 0.06, p.z);
  state.scene.add(pool);
  return { group, rotor, cone, pool, angle: 0 };
}

function spawnFootCop(state) {
  const p = state.player;
  const angle = Math.random() * Math.PI * 2;
  const cop = {
    x: p.x + Math.cos(angle) * 25,
    z: p.z + Math.sin(angle) * 25,
    heading: 0, hp: 60, alive: true, phase: 0,
    mesh: createPedMesh(0x1a3a8a),
  };
  // Navy uniform + cap: reuse the ped mesh, tinted dark blue.
  cop.mesh.position.set(cop.x, 0, cop.z);
  state.scene.add(cop.mesh);
  state.cops.push(cop);
}

export function stepPolice(state, dt) {
  const p = state.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  // Helicopter at 4+ stars: circles the player, searchlight pinned on him.
  const stars = wantedStars(state.wantedHeat);
  if (stars >= 4 && !state.heli) state.heli = spawnHeli(state);
  if (stars < 4 && state.heli) {
    state.scene.remove(state.heli.group);
    state.scene.remove(state.heli.pool);
    state.heli = null;
  }
  if (state.heli) {
    const h = state.heli;
    h.angle += dt * 0.45;
    h.group.position.set(px + Math.cos(h.angle) * 34, 42, pz + Math.sin(h.angle) * 34);
    h.group.rotation.y = -h.angle;
    h.rotor.rotation.y += dt * 22;
    // Searchlight cone from the heli down to the player.
    const top = h.group.position;
    const dir = new THREE.Vector3(px - top.x, -top.y, pz - top.z);
    const dist = dir.length();
    dir.normalize();
    h.cone.position.set((top.x + px) / 2, top.y / 2, (top.z + pz) / 2);
    h.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    h.cone.scale.set(1, dist / 12, 1);
    h.pool.position.set(px, 0.06, pz);
    h.pool.material.opacity = 0.16 + Math.sin(state.time * 6) * 0.05;
  }
  // Patrol cars steer at the player and ram. In staged screenshot mode
  // they just cruise straight, so the shot shows a pursuit, not a pile-up.
  for (const car of state.policeCars) {
    const dx = px - car.x;
    const dz = pz - car.z;
    const d = Math.hypot(dx, dz) || 1;
    if (state.input.shotMode) {
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      syncCarMesh(car, dt);
      const barMat0 = car.mesh.userData.barMat;
      if (barMat0) {
        const phase0 = Math.floor(state.time * 3 + (car.mesh.userData.barT || 0) * 2) % 2;
        barMat0.color.setHex(phase0 === 0 ? 0xff2222 : 0x2266ff);
      }
      continue;
    }
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
    car.speed = Math.min(CFG.copCarSpeed, car.speed + 12 * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    state.city.collideCircle(car, CFG.carRadius);
    if (d < 3.2) {
      // Ram: shove the player's car, or hurt Jace on foot.
      if (p.onFoot) {
        p.hp -= 25 * dt * 4;
        state.fx.addShake(0.3);
        state.fx.burst(p.x, 1.2, p.z, 0xff4444, 6, 5);
      } else {
        p.car.speed *= 0.92;
        p.car.x += (dx / d) * 1.2 * dt * 10;
        p.car.z += (dz / d) * 1.2 * dt * 10;
        state.fx.addShake(0.35);
        state.audio.crash();
      }
      car.speed *= 0.5;
    }
    syncCarMesh(car, dt);
    // Flashing light bar: red / blue, alternating.
    const barMat = car.mesh.userData.barMat;
    if (barMat) {
      const phase = Math.floor(state.time * 3 + (car.mesh.userData.barT || 0) * 2) % 2;
      barMat.color.setHex(phase === 0 ? 0xff2222 : 0x2266ff);
    }
  }
  // Foot cops run at Jace; touching him on foot busts him.
  for (const cop of state.cops) {
    if (!cop.alive) continue;
    const dx = p.x - cop.x;
    const dz = p.z - cop.z;
    const d = Math.hypot(dx, dz) || 1;
    if (p.onFoot && d < 1.6) {
      state.bust();
      return;
    }
    if (p.onFoot) {
      cop.x += (dx / d) * CFG.copRunSpeed * dt;
      cop.z += (dz / d) * CFG.copRunSpeed * dt;
      cop.heading = Math.atan2(dx, dz);
      cop.phase += dt * 10;
    } else {
      // Player in a car: cops give up and hold position.
    }
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
    const swing = p.onFoot ? Math.sin(cop.phase) * 0.5 : 0;
    cop.mesh.userData.legs[0].rotation.x = swing;
    cop.mesh.userData.legs[1].rotation.x = -swing;
  }
}
