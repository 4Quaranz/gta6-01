// SUNPORT v2 — shared tuning, layout and helpers.
// The city is a road grid on the coast: beach and sea to the east,
// Neon Strip in the middle, Downtown to the west, Rustport to the south,
// and a bridge out to Cayo Verde island across the water.

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed turn from angle a to angle b, in radians.
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDelta(a, b) * t;
}

export const WORLD = {
  minX: -230,
  maxX: 320,
  minZ: -230,
  maxZ: 250,
  // Sand starts here, the sea a little further east.
  beachX0: 196,
  seaX: 228,
  // Bridge deck to Cayo Verde island.
  bridgeZ: 0,
  bridgeX0: 228,
  bridgeX1: 312,
  islandX: 318,
};

// North-south avenues and east-west streets (road centre lines, metres).
export const ROADS_X = [-160, -120, -80, -40, 0, 40, 80, 120, 160, 200];
export const ROADS_Z = [-160, -120, -80, -40, 0, 40, 80, 120, 160, 200];
export const ROAD_W = 10;
export const SIDEWALK_W = 3.5;

// Rico's Garage — mission 1 target. On the road grid's south-east corner.
export const GARAGE = { x: 168, z: 160 };

// Mission targets (all on or just beside a road).
export const TARGETS = {
  lenaPickup: { x: 40, z: 20 },
  rustportDrop: { x: -120, z: 160 },
  bank: { x: -60, z: -60 },
  marinaMeet: { x: 200, z: -80 },
};

export const SPEEDS = {
  walk: 4.3,
  sprint: 7.4,
  pedWalk: 1.4,
  pedJog: 3.1,
  pedFlee: 5.2,
  traffic: 11,
  carAccel: 16,
  carBrake: 30,
  carMax: 38,
  carReverseMax: 10,
  carTurn: 1.9,
  copCarMax: 34,
};

// Sprint stamina: drains while sprinting, refills while not sprinting.
export const STAMINA = {
  max: 100,
  drain: 24,
  regen: 15,
  minToSprint: 18,
};

// Wanted heat is 0..100; one star per 20 heat.
export const WANTED = {
  perStar: 20,
  stealCar: 10,
  punchPed: 8,
  punchCop: 15,
  shoot: 12,
  killPed: 20,
  decayPerSec: 1.1,
  // Police only ram when the player has been in a standoff this long,
  // or when wanted is 4 stars or more — never as an instant reply to a punch.
  ramStandoffSec: 4,
  ramMinStars: 4,
  // After the player throws a punch, police hold off ramming for this long.
  punchGraceSec: 3.5,
  punchStandoffExtra: 8,
};

export const COMBAT = {
  punchRange: 2.4,
  punchArc: 1.1,
  punchTime: 0.45,
  punchHitAt: 0.14,
  punchDamage: 22,
  punchKnock: 5.5,
  pistolDamage: 34,
  pistolRange: 60,
  magSize: 12,
};

export const PALETTE = {
  skyDay: 0x87c5eb,
  skyGolden: 0xffb36b,
  skyDusk: 0x2c3e63,
  skyNight: 0x0a1424,
  seaDay: 0x19b8c4,
  seaNight: 0x0a3a4a,
  sand: 0xeed9a4,
  grass: 0x5d8a4a,
  asphalt: 0x2e3138,
  sidewalk: 0x9aa0a3,
  neonPink: 0xff2e88,
  neonCyan: 0x19e3ff,
  neonYellow: 0xffd24a,
  neonMagenta: 0xe040fb,
};

// Pastel Art Deco hotel colours for Palmera Boulevard.
export const HOTEL_COLORS = [0xf7a8b8, 0xa8e6cf, 0xffd3a5, 0xffeef0, 0xa5d8ff, 0xf9e784];
// Downtown glass tower tints.
export const TOWER_COLORS = [0x2e4a6b, 0x3a5a7a, 0x27435f, 0x46586e];
// Rustport warehouse colours.
export const WAREHOUSE_COLORS = [0x8a6f5c, 0x7a7d84, 0x9c8468, 0x6f7a72];

export function districtAt(x, z) {
  if (x >= WORLD.seaX) return 'CAYO VERDE';
  if (x >= WORLD.beachX0) return 'SOLMAR BEACH';
  if (x >= 160 && z >= -120 && z <= 120) return 'PALMERA BLVD';
  if (x >= -40 && x <= 120 && z >= -40 && z <= 40) return 'NEON STRIP';
  if (x >= -120 && x < 0 && z >= -120 && z < 0) return 'DOWNTOWN';
  if (z >= 120) return 'RUSTPORT';
  if (x >= 160 && z >= -120 && z < -40) return 'MARINA';
  if (z <= -160) return 'NORTH SUNPORT';
  return 'SUNPORT';
}

// True when (x, z) is on a road surface (within half the road width of a
// road centre line), used for traffic lanes, spawning and the minimap.
export function isOnRoad(x, z) {
  const hw = ROAD_W / 2 + 1;
  for (const rx of ROADS_X) if (Math.abs(x - rx) <= hw && z >= -170 && z <= 210) return true;
  for (const rz of ROADS_Z) if (Math.abs(z - rz) <= hw && x >= -170 && x <= 210) return true;
  return false;
}

// Nearest point on the road grid to (x, z): snap to the closest avenue or
// street centre line.
export function nearestRoadPoint(x, z) {
  let bx = ROADS_X[0];
  let bd = Math.abs(x - bx);
  for (const rx of ROADS_X) {
    const d = Math.abs(x - rx);
    if (d < bd) { bd = d; bx = rx; }
  }
  let bz = ROADS_Z[0];
  bd = Math.abs(z - bz);
  for (const rz of ROADS_Z) {
    const d = Math.abs(z - rz);
    if (d < bd) { bd = d; bz = rz; }
  }
  // Snap to whichever centre line is closer.
  if (Math.abs(x - bx) <= Math.abs(z - bz)) return { x: bx, z };
  return { x, z: bz };
}
