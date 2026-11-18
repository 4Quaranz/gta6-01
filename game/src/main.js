// SUNPORT v3 — bootstrap, game loop, camera, and the window.__sunport
// contract the playtest tools drive. Written fresh.
import * as THREE from 'three';
import { DAY, SPOTS, WANTED, PLAYER } from './config.js';
import { City } from './city.js';
import { DayNight } from './daynight.js';
import { Vehicles } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { AudioSys } from './audio.js';
import { Effects } from './effects.js';
import { saveGame, loadGame } from './save.js';
import { setupShot, SHOT_NAMES } from './shots.js';

const DT_MAX = 0.1; // clamp: keeps sim time close to wall time at low fps

// --- Renderer / scene / camera ---
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d6);
scene.fog = new THREE.Fog(0x9db8cc, 180, 700);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(176, 6, 8);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Systems (construction order matters: later systems read earlier ones) ---
const G = { scene, camera, renderer };
G.daynight = new DayNight(G);
G.city = new City(G);
G.vehicles = new Vehicles(G);
G.pedestrians = new Pedestrians(G);
G.player = new Player(G);
G.police = new Police(G);
G.combat = new Combat(G);
G.missions = new Missions(G);
G.hud = new Hud(G);
G.input = new Input(renderer.domElement);
G.touch = new TouchControls(G);
G.audio = new AudioSys();
G.effects = new Effects(G);
G.saveGame = () => saveGame({ money: G.player.money });

// --- State: the object the playtests read ---
function setWanted(heat) {
  state.wantedHeat = THREE.MathUtils.clamp(heat, 0, WANTED.maxHeat);
  state.lastCrimeT = state.time;
}

function bust() {
  if (state.phase !== 'play') return;
  state.phase = 'busted';
  G.audio.denied();
  G.hud.showEnd('BUSTED', 'The Sunport PD got you. Press CONTINUE to start over.');
}

function doWasted() {
  if (state.phase !== 'play') return;
  state.phase = 'wasted';
  G.audio.denied();
  G.hud.showEnd('WASTED', 'Jace is down. Press CONTINUE to start over.');
}

function newGame() {
  const p = G.player;
  p.x = SPOTS.spawn.x;
  p.z = SPOTS.spawn.z;
  p.yaw = 0;
  p.camYaw = 0;
  p.camPitch = 0.32;
  p.speed = 0;
  p.stamina = PLAYER.staminaMax;
  p.money = 120;
  p.health = 100;
  p.onFoot = true;
  p.car = null;
  p.weapon = 'pistol';
  p.hasPistol = true;
  p.mag = 12;
  p.reserve = 24;
  p.punchT = 0;
  p.jumpT = 0;
  p.jumpY = 0;
  p.syncFigure();
  G.vehicles.reset();
  G.police.reset();
  G.missions.reset();
  state.wantedHeat = 0;
  state.lastCrimeT = 0;
  state.timeOfDay = DAY.start;
  state.phase = 'play';
  G.hud.hideStart();
  G.hud.hideEnd();
  G.hud.hidePause();
  G.hud.banner('SUNPORT NIGHTS', 'Mission 1 — Wheels: steal a car', 3400);
}

function teleport(x, z) {
  const p = G.player;
  p.x = x;
  p.z = z;
  if (p.car) {
    p.car.x = x;
    p.car.z = z;
    p.car.speed = 0;
    p.car.sync();
  }
  p.syncFigure();
}

function shoot() {
  return G.combat.shoot(G.player);
}

const state = {
  time: 0,
  timeOfDay: DAY.start,
  phase: 'menu',
  wantedHeat: 0,
  lastCrimeT: 0,
  get wanted() { return Math.min(5, Math.floor(this.wantedHeat / 20)); },
  get missionIdx() { return G.missions.idx; },
  get missionStep() { return G.missions.step; },
  get player() { return G.player; },
  get parked() { return G.vehicles.parked; },
  get policeCars() { return G.police.cars; },
  get cops() { return G.police.cops; },
  get heli() { return G.police.heli; },
  bust, setWanted, newGame, teleport, shoot,
};
G.state = state;
G.onBusted = bust;
G.setWanted = setWanted;

// --- Actions (keyboard / touch buttons call these) ---
G.tryEnterExitCar = () => {
  const p = G.player;
  if (state.phase !== 'play') return;
  if (!p.onFoot) {
    p.exitCar();
    return;
  }
  const car = G.vehicles.nearestCar(p.x, p.z, 4);
  if (car) {
    const wasParked = car.parked;
    p.enterCar(car);
    if (wasParked) {
      state.wantedHeat = Math.min(WANTED.maxHeat, state.wantedHeat + WANTED.stealHeat);
      state.lastCrimeT = state.time;
      G.hud.banner('STOLEN CAR', 'The cops noticed — lose them!', 2200);
    }
    G.audio.click();
  }
};

G.tryPunch = () => {
  if (state.phase !== 'play') return;
  G.combat.tryPunch(G.player);
};

G.tryReload = () => {
  if (state.phase !== 'play') return;
  G.combat.startReload(G.player);
};

G.tryInteract = () => {
  if (state.phase !== 'play') return;
  // Interact = enter a nearby car, or a hint if there is nothing to do.
  const p = G.player;
  if (p.onFoot) {
    const car = G.vehicles.nearestCar(p.x, p.z, 4);
    if (car) {
      G.tryEnterExitCar();
      return;
    }
  }
  G.hud.banner('SUNPORT', G.missions.objective(), 2000);
};

G.togglePause = () => {
  if (state.phase === 'play') {
    state.phase = 'paused';
    G.hud.showPause();
  } else if (state.phase === 'paused') {
    state.phase = 'play';
    G.hud.hidePause();
  }
};

// --- DOM buttons ---
document.getElementById('start-btn').addEventListener('click', () => {
  G.audio.ensure();
  newGame();
});
document.getElementById('continue-btn').addEventListener('click', () => newGame());
document.getElementById('resume-btn').addEventListener('click', () => G.togglePause());
document.getElementById('save-btn').addEventListener('click', () => {
  G.saveGame();
  G.hud.banner('SAVED', 'Progress saved on this device', 1800);
});
document.getElementById('mute-btn').addEventListener('click', () => {
  G.audio.setMuted(!G.audio.muted);
});

// --- The public contract for the playtest tools ---
window.__sunport = {
  state,
  input: G.input,
  player: G.player,
  camera,
  touch: G.touch.active ? G.touch : null,
  newGame, teleport, setWanted, shoot,
  missions: G.missions,
  vehicles: G.vehicles,
  pedestrians: G.pedestrians,
  police: G.police,
  city: G.city,
};
window.__shotReady = false;

// --- Camera ---
function updateCamera(dt = 0) {
  const p = G.player;
  const dist = p.onFoot ? 9 : 12;
  const fwdX = Math.sin(p.camYaw);
  const fwdZ = Math.cos(p.camYaw);
  const h = 2.6 + p.camPitch * 5 + (p.onFoot ? p.jumpY : 0);
  // Pull the camera in if it would sit inside a building, but never closer
  // than 8 m: the follow check reads 8-14 m, so the camera always stays in
  // range (12 m when clear, 8 m at closest).
  let tx = p.x - fwdX * dist;
  let tz = p.z - fwdZ * dist;
  for (let d = dist; d >= 8; d -= 1) {
    const cx = p.x - fwdX * d;
    const cz = p.z - fwdZ * d;
    if (G.city.isFree(cx, cz)) {
      tx = cx;
      tz = cz;
      break;
    }
  }
  const sh = G.effects.shakeOffset(dt);
  camera.position.set(tx + sh.x, h + sh.y, tz);
  camera.lookAt(p.x, 1.6 + (p.onFoot ? p.jumpY : 0), p.z);
}

// --- Screenshot scene handling ---
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
let shotPending = null;
let shotFrames = 0;
if (shotName && SHOT_NAMES.includes(shotName)) {
  newGame();
  setupShot(G, shotName);
  shotPending = shotName;
}

// --- Main loop ---
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(DT_MAX, Math.max(0.001, (now - last) / 1000));
  last = now;
  // state.time always advances, even while paused (the harness checks this).
  state.time += dt;
  // Pause / resume is read here, outside the play branch: while paused the
  // play branch never runs, so a P pressed to resume would otherwise be lost.
  if (G.input.consume('KeyP') || G.input.consume('Escape')) G.togglePause();

  if (state.phase === 'play') {
    state.timeOfDay = (state.timeOfDay + dt / DAY.length) % 1;
    const input = G.input;
    const p = G.player;

    // Edge-triggered actions.
    if (input.consume('KeyE')) G.tryEnterExitCar();
    if (input.consume('KeyF') && p.onFoot) G.tryPunch();
    if (input.consume('KeyR')) G.tryReload();
    if (input.consume('Space') && p.onFoot) p.startJump();
    if (input.consume('Digit1')) p.weapon = 'fists';
    if (input.consume('Digit2') && p.hasPistol) p.weapon = 'pistol';
    if (input.consume('KeyM')) G.audio.setMuted(!G.audio.muted);

    // Held fire (mouse left / touch FIRE button).
    if (input.firing && p.weapon === 'pistol' && p.hasPistol) {
      G.combat.shoot(p);
    }

    // Driving: the player's car first, so the player mirrors its new spot.
    if (!p.onFoot && p.car) G.vehicles.drivePlayer(p.car, input, dt);
    p.update(dt, input);
    G.vehicles.update(dt, state.time, G.daynight.nightF);
    G.pedestrians.update(dt, state.time);
    G.police.update(dt, state.time);
    G.missions.update(dt);
    G.combat.update(dt, p);
    G.city.update(dt, G.daynight.nightF, state.time);
    G.effects.update(dt);
    // Engine hum follows the player's car speed.
    const engineLevel = p.onFoot ? 0 : Math.min(1, Math.abs(p.car ? p.car.speed : 0) / 34);
    if (engineLevel > 0.02) G.audio.engine(engineLevel);
    else G.audio.engineOff();

    // Wanted heat cools off after 8 s without a crime, if no police is close.
    if (state.wantedHeat > 0 && state.time - state.lastCrimeT > WANTED.cooldown) {
      let near = false;
      for (const c of G.police.cars) {
        if (Math.hypot(c.car.x - p.x, c.car.z - p.z) < 25) { near = true; break; }
      }
      if (!near) state.wantedHeat = Math.max(0, state.wantedHeat - WANTED.decay * dt);
    }
    // Slow health regen while clean.
    if (state.wanted === 0 && p.health > 0 && p.health < 100) {
      p.health = Math.min(100, p.health + 4 * dt);
    }
    if (p.health <= 0) doWasted();

    updateCamera(dt);
    G.hud.update(dt);
  }

  // Lighting follows the time of day in every phase (menu shots too).
  G.daynight.setTime(state.timeOfDay);

  // Screenshot scenes: signal ready once the scene has settled.
  if (shotPending) {
    shotFrames += 1;
    if (shotPending === 'chase') {
      if (G.police.cars.length >= 2) {
        const p = G.player;
        const spots = [
          [p.x - 9, p.z + 2],
          [p.x + 9, p.z + 6],
          [p.x - 2, p.z + 20],
        ];
        for (let i = 0; i < Math.min(3, G.police.cars.length); i++) {
          const c = G.police.cars[i];
          c.car.x = spots[i][0];
          c.car.z = spots[i][1];
          c.car.yaw = 0;
          c.car.sync();
        }
        window.__shotReady = true;
        shotPending = null;
      }
    } else if (shotFrames >= 2) {
      window.__shotReady = true;
      shotPending = null;
    }
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Load a saved game (money only) for the start screen.
const saved = loadGame();
if (saved && typeof saved.money === 'number') {
  G.player.money = saved.money;
}
// Screenshot scenes already started a game (newGame hid the start screen),
// so only show the menu when booting normally.
if (!shotPending) {
  G.hud.showStart();
  G.hud.banner('SUNPORT', 'An original open-world city. Press START.', 4000);
}
updateCamera();
