// SUNPORT — screenshot staging for ?shot=.
// With a shot query the start screen is skipped and the world is staged
// deterministically (seed 1): start shows the title over the city at
// golden hour, street shows Jace on foot on Palmera Boulevard by Solmar
// Beach at midday, drive puts him in a convertible on the Neon Strip at
// night, chase stages a 3-star police pursuit downtown at dusk.
import { startMission } from './missions.js';
import { createCar, syncCarMesh } from './vehicles.js';

export function stageShot(state, shot) {
  const p = state.player;
  state.phase = 'play';
  state.input.shotMode = true;
  document.getElementById('menu').hidden = true;
  document.getElementById('hud').hidden = false;
  if (shot === 'start') {
    state.phase = 'menu';
    document.getElementById('menu').hidden = false;
    document.getElementById('hud').hidden = true;
    state.daynight.setHours(17.6); // golden hour over Palmera Boulevard
    // Menu camera orbits the city; the player stands on a downtown corner.
    p.x = 0; p.z = 0;
    p.camYaw = Math.PI * 0.75;
    state.menuOrbit = true;
  } else if (shot === 'street') {
    startMission(state, 0);
    state.daynight.setHours(13); // bright midday on the beach
    // Jace on foot on the boulevard sidewalk, camera south-west looking
    // north-east: sand + turquoise sea ahead, road + traffic to the left,
    // palms and crowd on the sidewalk. (z=-30 keeps the lamp poles at
    // z=8 and z=-72 out of the view axis.)
    p.x = 169; p.z = -30;
    p.yaw = Math.PI * 0.75;
    p.camYaw = -Math.PI / 4;
    p.camPitch = 0.3;
    p.hasPistol = true; p.weapon = 'pistol'; p.mag = 12; p.reserve = 24;
    crowdNear(state, 168, -30, 10);
    carsNear(state);
  } else if (shot === 'drive') {
    startMission(state, 0);
    state.daynight.setHours(22); // neon night on the Strip
    const car = state.parked.find((c) => c.type === 'convertible') || state.parked[0];
    enterCarForShot(state, car);
    car.speed = 26;
    car.heading = Math.PI / 2; // east along the Neon Strip (z=120)
    car.x = -40; car.z = 120;
    p.x = car.x; p.z = car.z;
    syncCarMesh(car, 0);
    crowdNear(state, -20, 120, 8);
  } else if (shot === 'chase') {
    startMission(state, 2);
    state.daynight.setHours(19); // dusk downtown
    const car = state.parked[0];
    enterCarForShot(state, car);
    car.speed = 28;
    car.heading = 0;
    car.x = 0; car.z = 20;
    p.x = car.x; p.z = car.z;
    syncCarMesh(car, 0);
    state.wantedHeat = 55; // exactly 3 stars (no helicopter yet)
    // A police interceptor ahead in the next lane, lights on, pacing the
    // player (shot mode: it cruises straight, no ramming).
    const cop = createCar(-6, 45, 0, 0x111111, 'police');
    cop.speed = 26;
    state.scene.add(cop.mesh);
    state.policeCars.push(cop);
    syncCarMesh(cop, 0);
    state.banner = { title: 'Mission 3 — Getaway', sub: 'Escape the police — reach the Safehouse with 3 stars' };
    state.bannerT = 60;
  }
  state.shotReadyAt = state.time + 0.5;
}

// Pull two traffic cars onto the boulevard so the street shot shows
// traffic as well as the crowd.
function carsNear(state) {
  const t = state.traffic;
  if (t[0]) {
    t[0].x = 157; t[0].z = -50; t[0].heading = 0; t[0].speed = 10;
    t[0].ai = { alongZ: true, street: 160, lane: -3, dir: 1, speed: 10 };
    syncCarMesh(t[0], 0);
  }
  if (t[1]) {
    t[1].x = 163; t[1].z = -75; t[1].heading = Math.PI; t[1].speed = 10;
    t[1].ai = { alongZ: true, street: 160, lane: 3, dir: -1, speed: 10 };
    syncCarMesh(t[1], 0);
  }
}

// Pull a few pedestrians near (x, z) so the shot reads crowded.
function crowdNear(state, x, z, n) {
  let placed = 0;
  for (const ped of state.peds) {
    if (placed >= n) break;
    if (ped.sitting) continue;
    ped.x = x + (placed % 4) * 4 - 6;
    ped.z = z + Math.floor(placed / 4) * 8 - 8;
    ped.mesh.position.set(ped.x, 0, ped.z);
    placed += 1;
  }
}

function enterCarForShot(state, car) {
  const p = state.player;
  car.kind = 'player';
  p.onFoot = false;
  p.car = car;
  p.mesh.visible = false;
  state.parked = state.parked.filter((c) => c !== car);
}
