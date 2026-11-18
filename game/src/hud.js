// SUNPORT — the HUD: health bar, cash, wanted stars, weapon and ammo,
// mission objective, driving speed, and a 2D top-down minimap (roads,
// player arrow, cars, police, mission marker) drawn on a small canvas.
import { CFG } from './config.js';
import { wantedStars } from './police.js';
import { missionState } from './missions.js';
import { LANDMARKS, districtAt } from './city.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  return {
    canvas: $('minimap'),
    ctx: $('minimap').getContext('2d'),
    lastObjective: '',
  };
}

function starString(n) {
  let s = '';
  for (let i = 0; i < 5; i += 1) s += i < n ? '★' : '☆';
  return s;
}

export function updateHud(state, hud) {
  const p = state.player;
  $('hp-fill').style.width = `${Math.max(0, p.hp)}%`;
  $('hp-num').textContent = String(Math.max(0, Math.ceil(p.hp)));
  $('money').textContent = `$${p.money.toLocaleString('en-US')}`;
  const stars = wantedStars(state.wantedHeat);
  $('stars').textContent = starString(stars);
  $('stars').style.color = stars > 0 ? '#ff5544' : '#888888';
  $('weapon').textContent = p.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
  $('ammo').textContent = p.hasPistol ? `${p.mag} / ${p.reserve}` : '—';
  const speed = p.onFoot ? Math.round(p.speed * 3.6) : Math.round(Math.abs(p.car.speed) * 3.6);
  $('speed').textContent = p.onFoot ? '' : `${speed} km/h`;
  const ms = missionState(state);
  const objective = ms.done
    ? 'FREE ROAM — Sunport Nights complete'
    : ms.step ? `${ms.mission.title} — ${ms.step.text}` : '';
  if (objective !== hud.lastObjective) {
    $('objective').textContent = objective;
    hud.lastObjective = objective;
  }
  if (state.bannerT > 0) {
    $('banner').hidden = false;
    $('banner-title').textContent = state.banner.title;
    $('banner-sub').textContent = state.banner.sub;
  } else {
    $('banner').hidden = true;
  }
  $('hint').textContent = state.hint || '';
  $('dmg').style.opacity = state.dmgFlash > 0 ? String(Math.min(0.7, state.dmgFlash)) : '0';
  // District name (Palmera Boulevard, Neon Strip, ...) follows the player.
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  $('district').textContent = districtAt(px, pz);
  // Lena / Jace dialogue line, shown a few seconds after each story beat.
  if (state.dialogT > 0) {
    state.dialogT -= 1 / 60;
    $('dialogue').textContent = state.dialogue || '';
  } else {
    $('dialogue').textContent = '';
  }
  // Touch: the enter button reads MASUK / KELUAR MOBIL with the state.
  if (state.touch) state.touch.setEnterLabel(p.onFoot ? 'MASUK MOBIL' : 'KELUAR MOBIL');
  drawMinimap(state, hud);
}

function toMap(v, size) {
  return ((v - CFG.worldMin) / (CFG.worldMax - CFG.worldMin)) * size;
}

function drawMinimap(state, hud) {
  const c = hud.ctx;
  const S = 180;
  c.clearRect(0, 0, S, S);
  c.fillStyle = '#1d2b1a';
  c.fillRect(0, 0, S, S);
  // Beach + sea on the east edge.
  c.fillStyle = '#e8d49a';
  c.fillRect(toMap(CFG.beachX, S), 0, S - toMap(CFG.beachX, S), S);
  c.fillStyle = '#19b8c4';
  c.fillRect(toMap(CFG.waterX, S), 0, S - toMap(CFG.waterX, S), S);
  // Roads.
  c.strokeStyle = '#7a828c';
  c.lineWidth = 4;
  for (const s of CFG.streets) {
    const m = toMap(s, S);
    c.beginPath(); c.moveTo(m, 0); c.lineTo(m, S); c.stroke();
    c.beginPath(); c.moveTo(0, m); c.lineTo(S, m); c.stroke();
  }
  // Landmarks.
  c.fillStyle = '#ffffff';
  for (const lm of Object.values(LANDMARKS)) {
    c.fillRect(toMap(lm.x, S) - 2, toMap(lm.z, S) - 2, 4, 4);
  }
  // Mission target marker (pulsing yellow diamond).
  const ms = missionState(state);
  if (ms.step && ms.step.target) {
    const mx = toMap(ms.step.target.x, S);
    const my = toMap(ms.step.target.z, S);
    const r = 5 + Math.sin(state.time * 5) * 2;
    c.fillStyle = '#ffd24a';
    c.beginPath();
    c.moveTo(mx, my - r); c.lineTo(mx + r, my); c.lineTo(mx, my + r); c.lineTo(mx - r, my);
    c.closePath(); c.fill();
  }
  // Traffic (white), police (blue/red), player (green arrow).
  const dot = (x, z, color, size = 3) => {
    c.fillStyle = color;
    c.fillRect(toMap(x, S) - size / 2, toMap(z, S) - size / 2, size, size);
  };
  for (const car of state.traffic) dot(car.x, car.z, '#dddddd', 2.5);
  for (const car of state.parked) dot(car.x, car.z, '#aaaaaa', 2.5);
  for (const car of state.policeCars) dot(car.x, car.z, '#3a86ff', 4);
  for (const cop of state.cops) if (cop.alive) dot(cop.x, cop.z, '#3a86ff', 3);
  const p = state.player;
  const px = p.onFoot ? p.x : p.car.x;
  const pz = p.onFoot ? p.z : p.car.z;
  const mx = toMap(px, S);
  const my = toMap(pz, S);
  const yaw = p.onFoot ? p.yaw : p.car.heading;
  c.fillStyle = '#39d353';
  c.beginPath();
  c.moveTo(mx + Math.sin(yaw) * 7, my + Math.cos(yaw) * 7);
  c.lineTo(mx + Math.sin(yaw + 2.5) * 5, my + Math.cos(yaw + 2.5) * 5);
  c.lineTo(mx + Math.sin(yaw - 2.5) * 5, my + Math.cos(yaw - 2.5) * 5);
  c.closePath(); c.fill();
}
