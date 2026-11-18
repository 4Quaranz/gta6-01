// SUNPORT v2 — ?shot= scenes for the four screenshots. Each one sets up
// a fixed, deterministic view (seeded RNG), then main renders one frame
// and raises window.__shotReady.

import { GARAGE } from './config.js';

// Repaint a car's body a bright colour so it reads in a screenshot.
function repaint(car, colorHex) {
  const paintMat = car.mesh.userData.paintMat;
  if (paintMat) { paintMat.color.setHex(colorHex); return; }
  car.mesh.traverse((o) => {
    if (o.isMesh && o.material && o.material.metalness === 0.3) o.material.color.setHex(colorHex);
  });
}

export function applyShot(shot, seed, ctx) {
  const { state, player, vehicles, police, daynight, hud, missions } = ctx;
  // Deterministic-ish setup; the RNG is already seeded by main.
  void seed;
  if (shot === 'start') {
    // Title screen: golden hour over Palmera Boulevard, Jace on foot.
    daynight.setTime(0.42);
    player.reset(190, 32, -Math.PI / 2);
    player.camYaw = -Math.PI / 2;
    state.phase = 'menu';
    hud.setObjective('Curi mobil apa saja');
    return;
  }
  if (shot === 'street') {
    // Midday on the boulevard: Jace walking south along the beach-side
    // sidewalk — hotels on the right, road and sea on the left, palms
    // framing the view, pedestrians and traffic around.
    daynight.setTime(0.22);
    player.reset(193.5, 55, 0);
    player.camYaw = Math.PI;
    state.phase = 'play';
    missions.startMission(0);
    return;
  }
  if (shot === 'drive') {
    // Golden hour: Jace driving a convertible down Palmera Boulevard.
    daynight.setTime(0.45);
    const car = vehicles.parked.find((c) => c.type === 'convertible') || vehicles.parked[0];
    player.reset(176, 44, Math.PI / 2);
    player.enterCar(car);
    car.x = 176;
    car.z = 44;
    car.yaw = Math.PI / 2; // east, down the boulevard toward the sea
    car.speed = 22;
    car.isParked = false;
    repaint(car, 0xd83a2e); // bright red, so the car pops against sand and sea
    player.camYaw = -Math.PI / 2; // camera behind the car, looking east
    state.phase = 'play';
    state.wantedHeat = 10;
    missions.startMission(0);
    missions.step = 1;
    missions.target = { x: GARAGE.x, z: GARAGE.z };
    return;
  }
  if (shot === 'chase') {
    // Dusk on the bridge to Cayo Verde: 4 stars, a police roadblock ahead
    // on the bridge, the helicopter overhead, the lighthouse beam.
    // 0.46 is late golden hour / early dusk: the sun is still up enough
    // for the cars to read, while the sky is already pink-purple.
    daynight.setTime(0.46);
    const car = vehicles.parked.find((c) => c.type === 'muscle') || vehicles.parked[0];
    player.reset(260, 0, Math.PI / 2);
    player.enterCar(car);
    car.x = 260;
    car.z = 0;
    car.yaw = Math.PI / 2; // east, across the bridge toward the island
    car.speed = 26;
    car.isParked = false;
    repaint(car, 0xf2c200); // bright yellow, so the car reads at dusk
    player.camYaw = -Math.PI / 2; // camera behind, looking east along the bridge
    state.phase = 'play';
    state.wantedHeat = 85; // 4 stars, so the helicopter stays up
    // Roadblock on the island, ahead of where the player will be when the
    // screenshot is taken (player drives east ~39 m during the settle).
    // Both start at speed 0 so they are still ~10 m ahead, in frame, with
    // their light bars flashing, instead of falling behind the camera.
    const pc1 = police.spawnCar(322, -3, 0);
    pc1.x = 322; pc1.z = -3; pc1.yaw = -Math.PI / 2; pc1.speed = 0; pc1.mode = 'APPROACH';
    const pc2 = police.spawnCar(318, 3, 0);
    pc2.x = 318; pc2.z = 3; pc2.yaw = -Math.PI / 2; pc2.speed = 0; pc2.mode = 'APPROACH';
    police.spawnHeli(260, 0);
    missions.startMission(2);
    missions.step = 1;
    missions.target = { x: -120, z: 160 };
    hud.setObjective('Kabur dari kejaran polisi');
    return;
  }
  // Unknown shot: just play.
  state.phase = 'play';
}
