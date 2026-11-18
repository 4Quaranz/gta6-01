// SUNPORT v2 — save/load in localStorage (one key, one small object).

export const SAVE_KEY = 'sunport-save-v1';

export function saveGame(state) {
  try {
    const data = {
      money: Math.floor(state.player.money),
      missionIdx: state.missionIdx,
      health: Math.round(state.player.health),
      x: Math.round(state.player.x * 10) / 10,
      z: Math.round(state.player.z * 10) / 10,
      timeOfDay: state.timeOfDay ?? 0.06,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
