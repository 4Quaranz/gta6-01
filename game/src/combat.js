// SUNPORT — combat and pickups.
// Fists (F) swing at whatever is in front of Jace; the pistol (left click)
// is a hitscan shot from the camera with a tracer line, muzzle flash and
// limited ammo. R reloads. Pistol, ammo and health pickups sit around the
// city as glowing boxes and respawn after a while.
import * as THREE from 'three';
import { CFG } from './config.js';
import { addWanted } from './police.js';
import { scarePeds } from './pedestrians.js';

export function createPickups(scene) {
  const defs = [
    { kind: 'pistol', x: 20, z: -20, color: 0xffd24a },
    { kind: 'ammo', x: -60, z: 60, color: 0xffd24a },
    { kind: 'ammo', x: 100, z: -60, color: 0xffd24a },
    { kind: 'health', x: -150, z: -150, color: 0x39d353 },
    { kind: 'health', x: 60, z: 140, color: 0x39d353 },
  ];
  const pickups = [];
  for (const d of defs) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshBasicMaterial({ color: d.color }),
    );
    mesh.position.set(d.x, 0.9, d.z);
    scene.add(mesh);
    pickups.push({ ...d, mesh, taken: false, respawnT: 0 });
  }
  return pickups;
}

export function stepPickups(state, dt) {
  const p = state.player;
  for (const pk of state.pickups) {
    if (pk.taken) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) {
        pk.taken = false;
        pk.mesh.visible = true;
      }
      continue;
    }
    pk.mesh.rotation.y += dt * 1.5;
    pk.mesh.position.y = 0.9 + Math.sin(state.time * 2 + pk.x) * 0.15;
    if (!p.onFoot) continue;
    if (Math.hypot(pk.x - p.x, pk.z - p.z) < 2) {
      pk.taken = true;
      pk.mesh.visible = false;
      pk.respawnT = 45;
      if (pk.kind === 'pistol') {
        p.hasPistol = true;
        p.weapon = 'pistol';
        p.mag = CFG.pistolMag;
        p.reserve = 24;
        state.hint = 'Picked up a pistol — click to shoot, R to reload';
      } else if (pk.kind === 'ammo') {
        p.reserve += 24;
        if (!p.hasPistol) { p.hasPistol = true; p.weapon = 'pistol'; p.mag = CFG.pistolMag; }
        state.hint = '+24 pistol ammo';
      } else {
        p.hp = Math.min(CFG.playerHp, p.hp + 50);
        state.hint = '+50 health';
      }
      state.audio.pickup();
      state.fx.burst(pk.x, 1.2, pk.z, pk.color, 10, 5);
    }
  }
}

// Targets the pistol can hit: pedestrians, cops, police cars, traffic cars.
function aimTargets(state) {
  const list = [];
  for (const ped of state.peds) if (ped.alive) list.push({ x: ped.x, z: ped.z, y: 1.2, r: 1.0, hp: 'ped', ref: ped });
  for (const cop of state.cops) if (cop.alive) list.push({ x: cop.x, z: cop.z, y: 1.2, r: 1.0, hp: 'cop', ref: cop });
  for (const car of [...state.traffic, ...state.policeCars]) {
    list.push({ x: car.x, z: car.z, y: 1.0, r: 2.4, hp: 'car', ref: car });
  }
  return list;
}

export function playerShoot(state) {
  const p = state.player;
  if (p.weapon !== 'pistol' || !p.hasPistol) return false;
  if (p.reloading) return false;
  if (p.mag <= 0) { startReload(state); return false; }
  p.mag -= 1;
  state.audio.shot();
  // Aim from the camera through the screen centre.
  const cam = state.camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const origin = cam.position.clone();
  let best = null;
  let bestT = CFG.pistolRange;
  for (const t of aimTargets(state)) {
    const to = new THREE.Vector3(t.x - origin.x, t.y - origin.y, t.z - origin.z);
    const along = to.dot(dir);
    if (along < 1 || along > bestT) continue;
    const perp = to.clone().addScaledVector(dir, -along).length();
    if (perp < t.r + along * 0.02) { best = t; bestT = along; }
  }
  const end = origin.clone().addScaledVector(dir, best ? bestT : CFG.pistolRange);
  state.spawnTracer(origin, end);
  state.fx.burst(end.x, end.y, end.z, 0xffe9a8, 4, 3);
  if (best) {
    damageTarget(state, best, CFG.pistolDamage);
    state.fx.burst(best.x, best.y, best.z, 0xff5544, 8, 6);
  }
  addWanted(state, CFG.wantedPerShot);
  scarePeds(state.peds, p.x, p.z, 30);
  state.fx.addShake(0.12);
  return true;
}

export function playerPunch(state) {
  const p = state.player;
  state.audio.punch();
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  let hitAny = false;
  for (const ped of state.peds) {
    if (!ped.alive) continue;
    const dx = ped.x - p.x;
    const dz = ped.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < CFG.punchRange && (dx * fx + dz * fz) > 0) {
      ped.hp -= CFG.punchDamage;
      ped.fleeT = 4; ped.fleeX = p.x; ped.fleeZ = p.z;
      state.fx.burst(ped.x, 1.2, ped.z, 0xffe9a8, 6, 5);
      if (ped.hp <= 0) killPed(state, ped);
      else addWanted(state, CFG.wantedPerHitPed / 2);
      hitAny = true;
    }
  }
  for (const cop of state.cops) {
    if (!cop.alive) continue;
    const dx = cop.x - p.x;
    const dz = cop.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < CFG.punchRange && (dx * fx + dz * fz) > 0) {
      cop.hp -= CFG.punchDamage;
      if (cop.hp <= 0) {
        cop.alive = false;
        cop.mesh.visible = false;
        addWanted(state, 20);
      }
      hitAny = true;
    }
  }
  if (hitAny) state.fx.addShake(0.1);
  return hitAny;
}

function damageTarget(state, t, dmg) {
  if (t.hp === 'ped') {
    t.ref.hp -= dmg;
    t.ref.fleeT = 4; t.ref.fleeX = state.player.x; t.ref.fleeZ = state.player.z;
    if (t.ref.hp <= 0) killPed(state, t.ref);
    else addWanted(state, CFG.wantedPerHitPed / 2);
  } else if (t.hp === 'cop') {
    t.ref.hp -= dmg;
    if (t.ref.hp <= 0) {
      t.ref.alive = false;
      t.ref.mesh.visible = false;
      addWanted(state, 25);
    } else {
      addWanted(state, 15);
    }
  } else if (t.hp === 'car') {
    t.ref.hp -= dmg;
    if (t.ref.hp <= 0 && !t.ref.dead) {
      t.ref.dead = true;
      state.fx.burst(t.ref.x, 1.5, t.ref.z, 0xff8844, 24, 9);
      state.fx.addShake(0.4);
      state.audio.crash();
      addWanted(state, 15);
    }
  }
}

function killPed(state, ped) {
  ped.alive = false;
  ped.mesh.visible = false;
  addWanted(state, CFG.wantedPerHitPed);
  state.fx.burst(ped.x, 1.2, ped.z, 0xff5544, 12, 6);
}

export function startReload(state) {
  const p = state.player;
  if (p.reloading || p.mag >= CFG.pistolMag || p.reserve <= 0) return;
  p.reloading = true;
  p.reloadT = CFG.reloadTime;
  state.audio.reload();
}

export function updateReload(state, dt) {
  const p = state.player;
  if (!p.reloading) return;
  p.reloadT -= dt;
  if (p.reloadT <= 0) {
    const need = CFG.pistolMag - p.mag;
    const take = Math.min(need, p.reserve);
    p.mag += take;
    p.reserve -= take;
    p.reloading = false;
  }
}
