// SUNPORT v3 — shared tuning constants. Written fresh for the v3 rebuild.
export const WORLD = {
  half: 260, // playable half-extent in metres (x and z in [-260, 260])
  beachX: 196, // sand strip starts here (east edge)
  seaX: 236, // open water starts here
  island: { x: 300, z: -220, r: 42 }, // Cayo Verde island centre + radius
  causewayZ: -220, // causeway road line to the island
};

// North-south road centre lines (x) and east-west road centre lines (z).
// Palmera Boulevard is the easternmost north-south road, along the beach.
export const NS_ROADS = [-192, -128, -64, 0, 64, 128, 176];
export const EW_ROADS = [-192, -128, -64, 0, 64, 128, 192];
export const ROAD_W = 12;

export const PLAYER = {
  walk: 4.3, // m/s on foot
  run: 7.4, // m/s sprinting
  accel: 42,
  staminaMax: 100,
  staminaDrain: 28, // per second while sprinting
  staminaRegen: 23, // per second while walking normally
  jumpSpeed: 7.4,
  jumpTime: 0.65, // seconds airborne
  radius: 0.55,
};

export const CAR = {
  accel: 14, // m/s^2
  brake: 18,
  handbrake: 26,
  maxSpeed: 36,
  maxReverse: 10,
  steer: 1.9, // rad/s at full lock, scaled by speed
  radius: 1.4,
};

export const WANTED = {
  perStar: 20, // heat points per wanted star
  maxHeat: 100,
  decayPerSec: 1.0,
  decayDelay: 5, // seconds after the last crime before heat decays
  cooldown: 8, // main-loop alias for decayDelay
  decay: 5, // main-loop alias: heat points lost per second while cooling off
  stealHeat: 25,
  punchHeat: 6,
  shotHeat: 12,
  killHeat: 30,
};

export const POLICE = {
  graceAfterPunch: 11.5, // seconds a punch buys: no ramming at all
  standoffMin: 12, // orbit distance (m)
  standoffMax: 18,
  ramMinStandoff: 4, // seconds of standoff before a ram is allowed
  bustDist: 3.2, // cop car close + slow = busted
  bustTime: 2.0,
  footBustDist: 1.6,
  footBustTime: 1.5,
};

// Sun-soaked Florida palette: golden hour + neon night.
export const PALETTE = {
  sand: 0xe8d8a8,
  sea: 0x19b8c4,
  seaDeep: 0x0a6f7d,
  grass: 0x4f8f4a,
  asphalt: 0x2e2e33,
  sidewalk: 0x9a9a94,
  pastel: [0xffb3c6, 0xa8e6cf, 0xffd3a5, 0xfdfd96, 0xa5d8ff, 0xffaaa5, 0xc3aed6],
  neonPink: 0xff2e88,
  neonCyan: 0x19e3ff,
  neonYellow: 0xffe14d,
  glass: 0x8fc7e8,
};

// Mission target points (must match the playtest harness).
export const SPOTS = {
  spawn: { x: 176, z: 20 }, // player start on Palmera Boulevard
  parked0: { x: 176, z: 42 }, // first parked convertible (mission 1 car)
  garage: { x: 168, z: 160 }, // mission 1 destination
  standDown: { x: -100, z: -100 },
};

// Day clock: t is the day fraction (0.00 midnight, 0.25 sunrise, 0.50 noon,
// 0.75 sunset). A full day lasts 240 s of sim time.
export const DAY = {
  start: 0.72, // late afternoon: golden hour is about to start
  length: 240,
};

// District rectangles for the HUD label (checked in order; matches
// City.districtAt). Cayo Verde and Solmar Beach are handled first in hud.js.
export const DISTRICTS = [
  { name: 'Neon Strip', x0: -40, x1: 90, z0: -40, z1: 90 },
  { name: 'Downtown', x0: -160, x1: 0, z0: -160, z1: -20 },
  { name: 'Rustport', x0: -200, x1: -60, z0: 60, z1: 200 },
  { name: 'Palmera Boulevard', x0: 140, x1: 196, z0: -260, z1: 260 },
];
