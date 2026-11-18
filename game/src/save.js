// SUNPORT — save and load through localStorage.
// Autosave runs every 15 s and after every finished mission; Continue on
// the start screen restores money, mission progress, weapons and position.
import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const p = state.player;
    const data = {
      money: p.money,
      missionIdx: state.missionIdx,
      missionStep: state.missionStep,
      hp: Math.max(1, Math.round(p.hp)),
      hasPistol: p.hasPistol,
      mag: p.mag,
      reserve: p.reserve,
      x: Math.round(p.x * 10) / 10,
      z: Math.round(p.z * 10) / 10,
      completed: state.missionsDone,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.money !== 'number' || typeof d.missionIdx !== 'number') return null;
    return d;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}
