// SUNPORT — "Sunport Nights": four chained missions for Jace Moreno.
// Each mission is a list of steps; a step is done when its check passes.
// Busted or wasted during a mission restarts that mission from step 0.
// The beacon in the world and the minimap both point at the current step.
import { LANDMARKS } from './city.js';
import { CFG } from './config.js';

export const MISSIONS = [
  {
    id: 'wheels',
    title: 'Mission 1 — Wheels',
    story: "Rico needs a ride, fast. Steal any parked car and bring it to his garage.",
    steps: [
      { text: 'Steal a car — walk up to one and press E', target: null, check: (s) => !s.player.onFoot, dialog: 'Lena: "Rico\'s waiting, Jace. Boost something quick — and don\'t get cute."' },
      { text: "Drive to Rico's Garage", target: LANDMARKS.garage, check: (s) => !s.player.onFoot && near(s, LANDMARKS.garage, 10), dialog: 'Jace: "One clean ride, coming up. Hold the garage door."' },
    ],
  },
  {
    id: 'pickup',
    title: 'Mission 2 — Pickup',
    story: 'A package is waiting at Pier 9. Grab it, then lay low at the safehouse.',
    steps: [
      { text: 'Pick up the package at Pier 9', target: LANDMARKS.packageSpot, check: (s) => near(s, LANDMARKS.packageSpot, 6), dialog: 'Lena: "Package is at Pier 9. Grab it before the tide turns."' },
      { text: 'Take the package to the Safehouse', target: LANDMARKS.safehouse, check: (s) => near(s, LANDMARKS.safehouse, 8), dialog: 'Jace: "Got it. Safehouse, then we vanish."' },
    ],
  },
  {
    id: 'getaway',
    title: 'Mission 3 — Getaway',
    story: 'The crew got spotted. The cops are on you — lose them and reach the safehouse.',
    steps: [
      { text: 'Escape the police — reach the Safehouse with 3 stars', target: LANDMARKS.safehouse, check: (s) => near(s, LANDMARKS.safehouse, 8), dialog: 'Lena: "The easy score went wrong — the whole city\'s on us now. DRIVE!"' },
    ],
    onStart: (s) => { s.wantedHeat = 61; },
  },
  {
    id: 'bigone',
    title: 'Mission 4 — The Big One',
    story: 'Sunport First Bank. Grab the cash, then vanish. The whole city will be looking for you.',
    steps: [
      { text: 'Reach Sunport First Bank', target: LANDMARKS.bank, check: (s) => near(s, LANDMARKS.bank, 10), dialog: 'Jace: "Sunport First Bank. In and out, Lena. Like we planned."' },
      { text: 'Grab the cash — hold your ground 4 seconds', target: LANDMARKS.bank, timed: 4, check: (s) => near(s, LANDMARKS.bank, 10), dialog: 'Lena: "Four seconds on the vault. Keep your head down!"' },
      { text: 'Escape with 4 stars — reach the Safehouse', target: LANDMARKS.safehouse, check: (s) => near(s, LANDMARKS.safehouse, 8), dialog: 'Jace: "We\'re rich — if we make the safehouse alive."' },
    ],
    onStart: (s) => { s.wantedHeat = 0; },
  },
];

function near(s, lm, r) {
  const p = s.player;
  const x = p.onFoot ? p.x : p.car.x;
  const z = p.onFoot ? p.z : p.car.z;
  return Math.hypot(x - lm.x, z - lm.z) < r;
}

export function missionState(state) {
  return {
    mission: MISSIONS[state.missionIdx] || null,
    step: state.missionIdx < MISSIONS.length ? MISSIONS[state.missionIdx].steps[state.missionStep] : null,
    done: state.missionIdx >= MISSIONS.length,
  };
}

export function startMission(state, idx) {
  state.missionIdx = idx;
  state.missionStep = 0;
  state.missionTimer = 0;
  const m = MISSIONS[idx];
  if (m && m.onStart) m.onStart(state);
  state.banner = { title: m.title, sub: m.story };
  state.bannerT = 5;
  if (m && m.steps[0] && m.steps[0].dialog) {
    state.dialogue = m.steps[0].dialog;
    state.dialogT = 6;
  }
}

// Advance the current mission; returns 'done' | 'step' | 'failed' | null.
export function updateMission(state, dt) {
  if (state.missionIdx >= MISSIONS.length) return null;
  const m = MISSIONS[state.missionIdx];
  const step = m.steps[state.missionStep];
  if (!step) return null;
  if (step.timed) {
    if (step.check(state)) {
      state.missionTimer += dt;
      state.hint = `Grabbing the cash… ${Math.ceil(step.timed - state.missionTimer)}s`;
      if (state.missionTimer >= step.timed) return advance(state);
    } else {
      state.missionTimer = 0;
    }
    return null;
  }
  if (step.check(state)) return advance(state);
  return null;
}

function advance(state) {
  const m = MISSIONS[state.missionIdx];
  state.missionStep += 1;
  state.missionTimer = 0;
  if (state.missionStep < m.steps.length && m.steps[state.missionStep].dialog) {
    state.dialogue = m.steps[state.missionStep].dialog;
    state.dialogT = 6;
  }
  if (state.missionStep >= m.steps.length) {
    const reward = CFG.missionRewards[state.missionIdx];
    state.player.money += reward;
    state.missionsDone.push(m.id);
    state.audio.missionDone();
    if (state.missionIdx === 2) state.wantedHeat = 0; // getaway worked
    if (state.missionIdx === 3) state.wantedHeat = 0;
    state.banner = { title: 'MISSION PASSED', sub: `${m.title} — +$${reward}` };
    state.bannerT = 4;
    state.missionIdx += 1;
    state.missionStep = 0;
    if (state.missionIdx < MISSIONS.length) {
      const next = MISSIONS[state.missionIdx];
      if (next.onStart) next.onStart(state);
      state.banner = { title: `${next.title}`, sub: next.story };
      state.bannerT = 5;
    } else {
      state.banner = { title: 'SUNPORT NIGHTS COMPLETE', sub: 'Jace pulled off the Big One. Free roam — the city is yours.' };
      state.bannerT = 6;
    }
    return 'done';
  }
  return 'step';
}

export function failMission(state, reason) {
  if (state.missionIdx >= MISSIONS.length) return;
  const m = MISSIONS[state.missionIdx];
  state.missionStep = 0;
  state.missionTimer = 0;
  state.banner = { title: 'MISSION FAILED', sub: `${m.title} — ${reason}. Try again.` };
  state.bannerT = 4;
}
