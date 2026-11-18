// SUNPORT — boot and the one game loop.
// The world advances in fixed 1/60 s steps and the renderer only paints
// what is there. Phases: menu, play, pause, busted, wasted. The loop owns
// the cross-module glue: entering and leaving cars, firing, wanted decay,
// mission progress, busted/wasted respawns, autosave and the HUD tick.
import * as THREE from 'three';
import { CFG } from './config.js';
import { makeRng } from './rng.js';
import { buildCity, LANDMARKS } from './city.js';
import { createPlayer, createPlayerMesh, stepPlayerOnFoot, updateCamera } from './player.js';
import { spawnTraffic, spawnParked, stepTraffic, stepPlayerCar, nearestCar, syncCarMesh } from './vehicles.js';
import { spawnPedestrians, stepPedestrians, scarePeds } from './pedestrians.js';
import { updateWanted, stepPolice, addWanted, wantedStars } from './police.js';
import { createPickups, stepPickups, playerShoot, playerPunch, startReload, updateReload } from './combat.js';
import { startMission, updateMission, failMission, missionState } from './missions.js';
import { createHud, updateHud } from './hud.js';
import { AudioSys } from './audio.js';
import { createEffects } from './effects.js';
import { createInput } from './input.js';
import { createTouchControls } from './touch.js';
import { createDayNight } from './daynight.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed') || 1);
const SHOT = params.get('shot');

// ---- renderer, scene, camera -------------------------------------------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5eb);
scene.fog = new THREE.Fog(0x87c5eb, 180, 420);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600);
scene.add(camera);

const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
sun.position.set(120, 180, 60);
scene.add(sun);
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a9a7a, 0.9);
scene.add(hemi);
const amb = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(amb);
const daynight = createDayNight(scene, { sun, hemi, amb });
daynight.setHours(17.6); // golden hour by default
if (SHOT) daynight.frozen = true; // staged shots keep their exact light

// ---- state --------------------------------------------------------------
const rng = makeRng(SEED);
const city = buildCity(scene, rng);
const state = {
  seed: SEED, rng, scene, camera, city,
  time: 0, phase: 'menu', menuOrbit: false,
  player: createPlayer(),
  traffic: spawnTraffic(scene, rng, city),
  parked: spawnParked(scene, rng, city),
  peds: spawnPedestrians(scene, rng),
  cops: [], policeCars: [],
  pickups: createPickups(scene),
  wantedHeat: 0, wanted: 0,
  heli: null,
  dialogue: '', dialogT: 0,
  missionIdx: 0, missionStep: 0, missionTimer: 0, missionsDone: [],
  banner: null, bannerT: 0, hint: '', dmgFlash: 0,
  audio: new AudioSys(),
  fx: createEffects(scene),
  daynight,
  saveT: 0, autosaveT: 0, shotReadyAt: 0,
};
state.player.mesh = createPlayerMesh();
scene.add(state.player.mesh);
state.hud = createHud();
state.input = createInput(renderer.domElement, () => {
  if (state.phase === 'menu') newGame();
});
state.touch = createTouchControls(state.input); // null on desktop
state.spawnTracer = spawnTracer;

// ---- tracer pool ---------------------------------------------------------
const TRACER_MAX = 16;
const tracers = [];
for (let i = 0; i < TRACER_MAX; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, t: 0 });
}
let tracerIdx = 0;
function spawnTracer(from, to) {
  const tr = tracers[tracerIdx];
  tracerIdx = (tracerIdx + 1) % TRACER_MAX;
  const pos = tr.line.geometry.attributes.position.array;
  pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
  pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
  tr.line.geometry.attributes.position.needsUpdate = true;
  tr.line.material.opacity = 0.9;
  tr.line.visible = true;
  tr.t = 0.07;
}

// ---- menu ---------------------------------------------------------------
function showMenu() {
  state.phase = 'menu';
  document.getElementById('menu').hidden = false;
  document.getElementById('hud').hidden = true;
  document.getElementById('pause').hidden = true;
  document.getElementById('endcard').hidden = true;
  document.getElementById('continue-btn').disabled = !hasSave();
  document.exitPointerLock?.();
}

function newGame() {
  const p = state.player;
  p.money = CFG.startMoney; p.hp = CFG.playerHp;
  p.hasPistol = false; p.mag = 0; p.reserve = 0; p.weapon = 'fists';
  p.x = -20; p.z = 20; p.y = 0; p.onFoot = true; p.car = null;
  p.mesh.visible = true;
  state.wantedHeat = 0;
  state.missionsDone = [];
  state.phase = 'play';
  document.getElementById('menu').hidden = true;
  document.getElementById('hud').hidden = false;
  state.audio.ensure();
  startMission(state, 0);
  saveGame(state);
}

function continueGame() {
  const d = loadGame();
  if (!d) return;
  const p = state.player;
  p.money = d.money; p.hp = d.hp;
  p.hasPistol = d.hasPistol; p.mag = d.mag; p.reserve = d.reserve;
  p.weapon = d.hasPistol ? 'pistol' : 'fists';
  p.x = d.x; p.z = d.z; p.y = 0; p.onFoot = true; p.car = null;
  p.mesh.visible = true;
  state.missionsDone = d.completed || [];
  state.wantedHeat = 0;
  state.phase = 'play';
  document.getElementById('menu').hidden = true;
  document.getElementById('hud').hidden = false;
  state.audio.ensure();
  startMission(state, Math.min(d.missionIdx, 3));
  state.missionStep = d.missionStep || 0;
}

document.getElementById('new-btn').addEventListener('click', newGame);
document.getElementById('continue-btn').addEventListener('click', continueGame);
document.getElementById('save-btn').addEventListener('click', () => {
  saveGame(state);
  state.hint = 'Game saved';
});
document.getElementById('resume-btn').addEventListener('click', () => {
  state.phase = 'play';
  document.getElementById('pause').hidden = true;
});
document.getElementById('quit-btn').addEventListener('click', showMenu);
document.getElementById('end-btn').addEventListener('click', showMenu);
document.getElementById('help-btn').addEventListener('click', () => {
  document.getElementById('help').hidden = !document.getElementById('help').hidden;
});

// ---- busted / wasted -----------------------------------------------------
state.bust = function bust() {
  if (state.phase !== 'play') return;
  state.phase = 'busted';
  state.audio.busted();
  failMission(state, 'Busted by the Sunport PD');
  showEnd('BUSTED', 'The Sunport PD caught you. You spend the night in a cell and lose your ride.');
  respawnAfter();
};
state.wasted = function wasted() {
  if (state.phase !== 'play') return;
  state.phase = 'wasted';
  state.audio.busted();
  failMission(state, 'Wasted');
  showEnd('WASTED', 'You wake up at Sunport General. The hospital bill stings.');
  respawnAfter();
};
function showEnd(title, sub) {
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-sub').textContent = sub;
  document.getElementById('endcard').hidden = false;
  document.exitPointerLock?.();
}
function respawnAfter() {
  const p = state.player;
  // Leave the car where it was; Jace wakes at the hospital, fined.
  if (p.car) { p.car = null; p.onFoot = true; }
  p.money = Math.max(0, p.money - CFG.hospitalFine);
  p.hp = CFG.playerHp;
  p.x = LANDMARKS.hospital.x + 8; p.z = LANDMARKS.hospital.z + 8; p.y = 0;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
  state.wantedHeat = 0;
  for (const c of state.policeCars) scene.remove(c.mesh);
  state.policeCars = [];
  for (const c of state.cops) scene.remove(c.mesh);
  state.cops = [];
  if (state.heli) {
    scene.remove(state.heli.group);
    scene.remove(state.heli.cone);
    scene.remove(state.heli.pool);
    state.heli = null;
  }
  saveGame(state);
}

// ---- cars: enter / exit ---------------------------------------------------
function tryEnterCar() {
  const p = state.player;
  if (!p.onFoot) {
    // Exit: step out beside the car.
    const car = p.car;
    p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 3;
    p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 3;
    p.y = 0;
    p.onFoot = true;
    p.car = null;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    state.hint = '';
    return;
  }
  const car = nearestCar([...state.parked, ...state.traffic], p.x, p.z, 5.5);
  if (!car) return;
  const stolen = car.kind === 'parked' || car.kind === 'traffic';
  if (stolen) {
    addWanted(state, CFG.wantedPerSteal);
    state.hint = 'Car stolen — the cops noticed!';
    state.audio.pickup();
    if (car.kind === 'traffic') {
      state.traffic = state.traffic.filter((c) => c !== car);
    } else {
      state.parked = state.parked.filter((c) => c !== car);
    }
  }
  car.kind = 'player';
  car.speed = 0;
  p.onFoot = false;
  p.car = car;
  p.mesh.visible = false;
}

// ---- fixed step -----------------------------------------------------------
function step(dt) {
  state.time += dt;
  const p = state.player;
  const input = state.input;

  if (state.phase === 'menu') {
    // Slow orbit over Palmera Boulevard and the beach for the title
    // screen: high enough to clear the downtown towers, looking east.
    const a = state.time * 0.05;
    camera.position.set(100 + Math.sin(a) * 110, 65, Math.cos(a) * 110);
    camera.lookAt(140, 0, 0);
    stepTraffic(state.traffic, dt, city);
    city.update(dt);
    return;
  }
  if (state.phase !== 'play') {
    // Drop stale one-shot presses so they never fire after unpausing.
    input.pressed.clear();
    return;
  }

  // One-shot keys.
  if (input.pressed.has('pause')) {
    state.phase = 'pause';
    document.getElementById('pause').hidden = false;
    document.exitPointerLock?.();
  }
  if (input.pressed.has('mute')) {
    state.audio.setMuted(!state.audio.muted);
    state.hint = state.audio.muted ? 'Sound muted (M)' : 'Sound on (M)';
  }
  if (input.pressed.has('help')) {
    document.getElementById('help').hidden = !document.getElementById('help').hidden;
  }
  if (input.pressed.has('enterCar')) tryEnterCar();
  if (input.pressed.has('punch') && p.onFoot) playerPunch(state);
  if (input.pressed.has('reload')) startReload(state);
  input.pressed.clear();

  // Movement.
  if (p.onFoot) {
    stepPlayerOnFoot(p, input, dt, city);
  } else {
    const look = input.consumeLook();
    p.car.heading += look.dx * 0.0012;
    stepPlayerCar(p.car, input, dt, city, state.fx, state.audio);
    p.x = p.car.x; p.z = p.car.z;
    p.camYaw = p.car.heading + Math.PI;
  }
  updateReload(state, dt);

  // Shooting: hold to fire, 4 shots a second.
  state.saveT += dt;
  if (input.firing && p.onFoot && p.weapon === 'pistol' && p.hasPistol) {
    if (state.saveT >= 0.25) {
      state.saveT = 0;
      playerShoot(state);
    }
  }

  // World life.
  stepTraffic(state.traffic, dt, city);
  stepPedestrians(state.peds, dt, city, p);
  stepPickups(state, dt);
  updateWanted(state, dt);
  stepPolice(state, dt);
  city.update(dt);
  daynight.update(dt);

  // Mission progress.
  const res = updateMission(state, dt);
  if (res === 'done') saveGame(state);

  // Player damage / death.
  if (p.hp <= 0) {
    state.wasted();
    return;
  }
  // On-foot collision with traffic hurts.
  if (p.onFoot) {
    for (const car of [...state.traffic, ...state.policeCars]) {
      if (Math.hypot(car.x - p.x, car.z - p.z) < 2.2 && Math.abs(car.speed) > 3) {
        p.hp -= 30 * dt * 3;
        state.dmgFlash = 0.6;
        state.fx.addShake(0.3);
        scarePeds(state.peds, p.x, p.z, 20);
      }
    }
  }
  if (state.dmgFlash > 0) state.dmgFlash -= dt * 1.5;
  if (state.bannerT > 0) state.bannerT -= dt;

  // Tracers fade.
  for (const tr of tracers) {
    if (!tr.line.visible) continue;
    tr.t -= dt;
    tr.line.material.opacity = Math.max(0, tr.t / 0.07) * 0.9;
    if (tr.t <= 0) tr.line.visible = false;
  }
  state.fx.update(dt);

  // Audio follows the game.
  const driving = !p.onFoot;
  state.audio.setEngine(driving ? Math.abs(p.car.speed) / CFG.carMaxSpeed : 0, driving);
  state.audio.setSiren(state.wanted > 0, state.time);
  state.audio.updateMusic(dt, state.phase === 'play');

  // Autosave every 15 s.
  state.autosaveT += dt;
  if (state.autosaveT > 15) {
    state.autosaveT = 0;
    saveGame(state);
  }
}

// ---- render ---------------------------------------------------------------
function render() {
  if (state.phase !== 'menu') {
    updateCamera(state.player, camera, 0, state.fx);
  }
  renderer.render(scene, camera);
}

// ---- main loop ------------------------------------------------------------
let last = performance.now();
let acc = 0;
let frames = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) {
    step(STEP);
    acc -= STEP;
    n += 1;
  }
  if (n === 5) acc = 0;
  render();
  if (state.phase !== 'menu') updateHud(state, state.hud);
  frames += 1;
  if (SHOT && !window.__shotReady && frames >= 3 && state.time > 0.4) window.__shotReady = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- shot modes -----------------------------------------------------------
if (SHOT) {
  stageShot(state, SHOT);
} else {
  showMenu();
}

// ---- debug hooks for headless verification --------------------------------
window.__sunport = {
  state,
  input: state.input,
  touch: state.touch,
  setHours(h) { daynight.setHours(h); },
  teleport(x, z) {
    const p = state.player;
    p.x = x; p.z = z;
    if (p.mesh) p.mesh.position.set(x, 0, z);
  },
  enterNearestCar() { tryEnterCar(); },
  startMission(i) { startMission(state, i); },
  setWanted(h) { state.wantedHeat = h; },
  shoot() { return playerShoot(state); },
  newGame,
};

requestAnimationFrame(loop);
