// SUNPORT v2 — bootstrap and game loop. Wires every system together:
// renderer + camera, city, day/night, HUD, input, player, pedestrians,
// vehicles, police, combat, missions, save, touch and the ?shot= scenes.
// Exposes window.__sunport for debugging and for the headless playtests.

import * as THREE from 'three';
import { RNG } from './rng.js';
import { WORLD, WANTED, clamp, lerp } from './config.js';
import { AudioSys } from './audio.js';
import { Effects } from './effects.js';
import { buildCity } from './city.js';
import { DayNight } from './daynight.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Pedestrians } from './pedestrians.js';
import { Vehicles } from './vehicles.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { saveGame, loadGame } from './save.js';
import { TouchUI } from './touch.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 1);
const shot = params.get('shot');
const rng = new RNG(seed);

// --- Renderer / scene / camera --------------------------------------------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5eb);
scene.fog = new THREE.Fog(0x9fc4de, 90, 420);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(160, 14, 60);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Systems ---------------------------------------------------------------
const audio = new AudioSys();
const effects = new Effects(scene);
const city = buildCity(scene, rng);
const daynight = new DayNight(scene, city, renderer);
const hud = new HUD();
const input = new Input();
input.attach();
const player = new Player(scene);
player.reset(city.spawn.x, city.spawn.z, city.spawn.yaw);
const pedestrians = new Pedestrians(scene, rng, city);
const vehicles = new Vehicles(scene, rng, city);
const police = new Police(scene, rng, city, vehicles);
const combat = new Combat(audio, effects);
const missions = new Missions(scene, hud, audio);

// --- Shared state (the debug contract) --------------------------------------
const state = {
  time: 0,
  phase: 'menu', // menu | play | paused | busted | wasted
  player,
  parked: vehicles.parked,
  wantedHeat: 0,
  wanted: 0,
  lastCrimeT: -100,
  timeOfDay: daynight.t,
  missionTarget: null,
  policeCars: police.cars,
  cops: police.cops,
  heli: null,
  onMissionComplete: null,
  bust: () => doBust(),
};
Object.defineProperty(state, 'missionIdx', {
  get: () => missions.idx,
  set: (v) => { missions.idx = v; },
  enumerable: true,
});
Object.defineProperty(state, 'missionStep', {
  get: () => missions.step,
  set: (v) => { missions.step = v; },
  enumerable: true,
});

// --- Menu / pause / end wiring ----------------------------------------------
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const endEl = document.getElementById('end');
const btnNewGame = document.getElementById('btn-new-game');
const btnContinue = document.getElementById('btn-continue');
const btnControls = document.getElementById('btn-controls');
const controlsEl = document.getElementById('controls');
const btnResume = document.getElementById('btn-resume');
const btnSave = document.getElementById('save-btn');
const btnQuit = document.getElementById('btn-quit');
const btnRetry = document.getElementById('end-retry');
const btnMenu = document.getElementById('end-menu');

function showOnly(el) {
  for (const x of [menuEl, pauseEl, endEl]) if (x) x.hidden = true;
  if (el) el.hidden = false;
}

function clearPolice() {
  for (const c of [...police.cars]) police.removeCar(c);
  for (const c of [...police.cops]) police.removeCop(c);
  if (police.heli) { scene.remove(police.heli.mesh); police.heli = null; }
}

function newGame() {
  audio.ensure();
  audio.click();
  input.clearPressed(); // menu keypresses must not leak into the new game
  clearPolice();
  player.reset(city.spawn.x, city.spawn.z, city.spawn.yaw);
  player.money = 120;
  player.hasPistol = false;
  player.weapon = 'fists';
  player.mag = 12;
  player.reserve = 24;
  state.wantedHeat = 0;
  state.wanted = 0;
  state.lastCrimeT = -100;
  daynight.setTime(0.06);
  missions.reset();
  state.onMissionComplete = () => { saveGame(state); };
  hud.hideEnd();
  showOnly(null);
  state.phase = 'play';
  updateEnterLabel();
}

function continueGame() {
  const save = loadGame();
  audio.ensure();
  audio.click();
  input.clearPressed(); // menu keypresses must not leak into the game
  if (!save) { newGame(); return; }
  clearPolice();
  player.reset(save.x ?? city.spawn.x, save.z ?? city.spawn.z, city.spawn.yaw);
  player.money = save.money ?? 120;
  player.health = save.health ?? 100;
  state.wantedHeat = 0;
  state.wanted = 0;
  state.lastCrimeT = -100;
  daynight.setTime(save.timeOfDay ?? 0.06);
  missions.reset();
  if (save.missionIdx > 0) missions.startMission(Math.min(3, save.missionIdx));
  if (save.missionIdx >= 3) { player.hasPistol = true; }
  state.onMissionComplete = () => { saveGame(state); };
  hud.hideEnd();
  showOnly(null);
  state.phase = 'play';
  updateEnterLabel();
}

function togglePause() {
  input.clearPressed(); // the pause key itself + any stale presses stay out
  if (state.phase === 'play') {
    state.phase = 'paused';
    showOnly(pauseEl);
    audio.click();
  } else if (state.phase === 'paused') {
    state.phase = 'play';
    showOnly(null);
    audio.click();
  }
}

function doBust() {
  if (state.phase === 'busted') return;
  state.phase = 'busted';
  audio.busted();
  audio.siren(false);
  audio.engineOff();
  hud.showEnd('BUSTED', 'Officer Kane menangkapmu. Uang hasil misi hangus setengah.');
  player.money = Math.floor(player.money / 2);
  showOnly(endEl);
}

function doWasted() {
  if (state.phase === 'wasted') return;
  state.phase = 'wasted';
  audio.busted();
  hud.showEnd('WASTED', 'Jace tumbang. Rumah sakit Sunport menagih $100.');
  player.money = Math.max(0, player.money - 100);
  showOnly(endEl);
}

btnNewGame.addEventListener('click', newGame);
btnContinue.addEventListener('click', continueGame);
btnControls.addEventListener('click', () => {
  controlsEl.hidden = !controlsEl.hidden;
  audio.ensure();
  audio.click();
});
btnResume.addEventListener('click', togglePause);
btnSave.addEventListener('click', () => {
  audio.ensure();
  const ok = saveGame(state);
  btnSave.textContent = ok ? 'TERSIMPAN ✓' : 'GAGAL SIMPAN';
  setTimeout(() => { btnSave.textContent = 'SIMPAN'; }, 1200);
});
btnQuit.addEventListener('click', () => {
  saveGame(state);
  state.phase = 'menu';
  showOnly(menuEl);
  refreshContinue();
});
btnRetry.addEventListener('click', newGame);
btnMenu.addEventListener('click', () => {
  state.phase = 'menu';
  showOnly(menuEl);
  refreshContinue();
});

function refreshContinue() {
  const save = loadGame();
  btnContinue.hidden = !save;
  if (save) btnContinue.textContent = `LANJUTKAN — $${save.money} · Misi ${save.missionIdx + 1}`;
}
refreshContinue();

// --- Touch controls ----------------------------------------------------------
const touch = new TouchUI(input, {
  onEnter: () => input.queue('KeyE'),
  onPunch: () => input.queue('KeyF'),
  onReload: () => input.queue('KeyR'),
  onInteract: () => input.queue('KeyE'),
  onPause: () => input.queue('KeyP'),
  onFireStart: () => {},
  onFireStop: () => {},
});
const touchActive = touch.attach();

function updateEnterLabel() {
  const el = document.getElementById('btn-enter');
  if (!el) return;
  const label = player.onFoot ? 'MASUK MOBIL' : 'KELUAR MOBIL';
  if (el.textContent !== label) el.textContent = label;
}

// --- Car enter / exit ---------------------------------------------------------
function tryEnterExitCar() {
  if (player.onFoot) {
    const car = vehicles.nearestCar(player.x, player.z, 3.5);
    if (!car) return;
    if (car.isParked && !car.stolen) {
      car.stolen = true;
      state.wantedHeat = Math.min(100, state.wantedHeat + WANTED.stealCar);
      state.lastCrimeT = state.time;
      hud.setHint('Mobil dicuri! Polisi waspada.');
    }
    if (car.isParked) car.isParked = false;
    const ti = vehicles.traffic.indexOf(car);
    if (ti >= 0) vehicles.traffic.splice(ti, 1);
    car.isPlayer = true;
    player.enterCar(car);
    audio.click();
  } else {
    const car = player.car;
    player.exitCar();
    if (car) car.isPlayer = false;
    audio.click();
  }
  updateEnterLabel();
}

// --- Shared per-frame context for the systems ----------------------------------
function makeCtx() {
  return {
    time: state.time,
    state,
    player,
    pedestrians,
    police,
    daynight,
    camera,
    colliders: city.colliders,
    onRam: (car) => {
      // A police ram: damage + shove + shake. On foot it knocks Jace down.
      if (player.onFoot) {
        player.takeDamage(12);
        hud.flashDamage();
        const dx = player.x - car.x;
        const dz = player.z - car.z;
        const l = Math.hypot(dx, dz) || 1;
        player.x += (dx / l) * 2;
        player.z += (dz / l) * 2;
      } else if (player.car) {
        player.car.speed *= 0.35;
        player.takeDamage(6);
        hud.flashDamage();
      }
      effects.shake(0.4);
      audio.punch();
    },
    onBust: () => doBust(),
    onShake: (amt) => effects.shake(amt),
  };
}

// --- Camera -------------------------------------------------------------------
let menuOrbit = 0;
let fov = 62;
function updateCamera(dt) {
  if (state.phase === 'menu') {
    menuOrbit += dt * 0.06;
    const cx = 180 + Math.cos(menuOrbit) * 34;
    const cz = 20 + Math.sin(menuOrbit) * 30;
    camera.position.set(cx, 13 + Math.sin(menuOrbit * 0.7) * 2, cz);
    camera.lookAt(186, 6, 10);
    camera.fov = 58;
    camera.updateProjectionMatrix();
    return;
  }
  const p = player;
  const dist = p.onFoot ? 7.5 : 11;
  const height = p.onFoot ? 2.4 + p.camPitch * 2.2 : 3.4 + p.camPitch * 2.0;
  const fx = Math.sin(p.camYaw);
  const fz = Math.cos(p.camYaw);
  const tx = p.x + fx * dist;
  const tz = p.z + fz * dist;
  camera.position.x = lerp(camera.position.x, tx, Math.min(1, dt * 10));
  camera.position.y = lerp(camera.position.y, height, Math.min(1, dt * 10));
  camera.position.z = lerp(camera.position.z, tz, Math.min(1, dt * 10));
  if (camera.position.y < 0.6) camera.position.y = 0.6;
  camera.lookAt(p.x - fx * 4 + effects.shakeX, 1.6 + effects.shakeY, p.z - fz * 4);
  const targetFov = p.onFoot ? 62 : 62 + Math.min(12, Math.abs(p.car ? p.car.speed : 0) * 0.35);
  fov = lerp(fov, targetFov, Math.min(1, dt * 4));
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// --- Hints ----------------------------------------------------------------------
function updateHint() {
  if (state.phase !== 'play') { hud.setHint(''); return; }
  if (!player.onFoot) {
    hud.setHint('W/S gas & rem · A/D setir · [Space] handbrake · [E] keluar mobil');
  } else {
    const car = vehicles.nearestCar(player.x, player.z, 3.5);
    if (car) hud.setHint('[E] MASUK MOBIL');
    else if (state.wanted > 0) hud.setHint('Polisi mengejarmu — tahan SHIFT / LARI untuk lari!');
    else if (missions.idx === 2 && missions.step === 0) hud.setHint('Buat keributan: pukul (F) atau curi mobil');
    else hud.setHint('WASD jalan · [F] pukul · [Space] lompat · [E] masuk mobil');
  }
}

// --- Main loop -------------------------------------------------------------------
const clock = new THREE.Clock();
let shotReadySent = false;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;
  const ctx = makeCtx();

  if (state.phase === 'play') {
    // --- Input: edge-triggered actions ------------------------------------
    if (input.consume('KeyE')) tryEnterExitCar();
    if (input.consume('KeyF')) {
      // Any punch — hit or whiff — makes the police hold off ramming.
      if (combat.tryPunch(player)) police.onPunch(state.time);
    }
    if (input.consume('KeyR')) combat.startReload(player);
    if (input.consume('Digit1')) player.weapon = 'fists';
    if (input.consume('Digit2') && player.hasPistol) player.weapon = 'pistol';
    if (input.consume('KeyP') || input.consume('Escape')) togglePause();
    if (input.consume('KeyM')) audio.setMuted(!audio.muted);
    // --- Player / car ------------------------------------------------------
    if (player.onFoot) {
      player.update(dt, input, ctx);
      if (input.firing && player.weapon === 'pistol') combat.shoot(player, ctx);
    } else if (player.car) {
      const sp = vehicles.drivePlayer(player.car, input, dt, ctx);
      player.update(dt, input, ctx);
      audio.engine(Math.min(1, Math.abs(sp) / 38));
      if (input.firing && player.weapon === 'pistol') combat.shoot(player, ctx);
    }
    if (player.onFoot) audio.engineOff();
    // --- World ---------------------------------------------------------------
    pedestrians.update(dt, ctx);
    vehicles.update(dt, ctx);
    combat.update(dt, player);
    combat.resolvePending(ctx);
    // Wanted heat decays once the trail goes cold.
    if (state.time - state.lastCrimeT > 5) {
      state.wantedHeat = Math.max(0, state.wantedHeat - WANTED.decayPerSec * dt);
    }
    state.wanted = Math.min(5, Math.floor(state.wantedHeat / 20));
    police.update(dt, ctx);
    missions.update(dt, ctx);
    // Mission 3 hands Jace a pistol.
    if (missions.idx === 3 && !player.hasPistol) {
      player.hasPistol = true;
      hud.showBanner('PISTOL DIDAPAT', 'Tekan 2 untuk memakai pistol');
    }
    // Siren while police are near.
    const nearCop = police.cars.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 60);
    audio.siren(state.wanted > 0 && nearCop);
    // Busted / wasted.
    if (player.health <= 0) doWasted();
    state.missionTarget = missions.target;
    state.timeOfDay = daynight.t;
    state.heli = police.heli;
    updateHint();
    updateEnterLabel();
    hud.update(state, dt);
    document.getElementById('crosshair').style.display = player.weapon === 'pistol' ? 'block' : 'none';
  } else if (state.phase === 'menu') {
    pedestrians.update(dt, ctx);
    vehicles.update(dt, ctx);
    state.missionTarget = null;
  } else if (state.phase === 'busted' || state.phase === 'wasted') {
    pedestrians.update(dt, ctx);
    vehicles.update(dt, ctx);
  } else if (state.phase === 'paused') {
    // Paused: the sim freezes, but P / Esc must still resume the game.
    if (input.consume('KeyP') || input.consume('Escape')) togglePause();
    if (input.consume('KeyM')) audio.setMuted(!audio.muted);
  }
  // Paused: the sim freezes; only the ambient day/night keeps its place.

  daynight.update(dt, state.time);
  effects.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);

  if (shot && !shotReadySent) {
    window.__shotReady = true;
    shotReadySent = true;
  }
}

// --- Shot scenes ------------------------------------------------------------------
if (shot) {
  // Apply the shot setup before the first frame.
  const ctx = makeCtx();
  state.onMissionComplete = () => {};
  applyShot(shot, seed, { state, player, vehicles, police, daynight, hud, missions, camera });
  if (shot === 'start') showOnly(menuEl);
  else showOnly(null);
  state.timeOfDay = daynight.t;
}

// --- Debug API (used by the headless playtests) --------------------------------------
window.__sunport = {
  state,
  input,
  camera,
  touch: touchActive ? touch : null,
  police,
  pedestrians,
  city,
  daynight,
  newGame,
  teleport: (x, z) => {
    if (player.car) { player.exitCar(); }
    player.x = x;
    player.z = z;
    player.group.position.set(x, 0, z);
  },
  setWanted: (n) => {
    state.wantedHeat = clamp(n, 0, 100);
    state.wanted = Math.min(5, Math.floor(state.wantedHeat / 20));
    state.lastCrimeT = state.time;
  },
  shoot: () => combat.shoot(player, makeCtx()),
  bust: () => doBust(),
};

loop();
