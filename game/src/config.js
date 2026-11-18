// SUNPORT — shared tuning numbers.
// One place for every magic number the other modules use, so balancing the
// game means editing this file, not hunting through the simulation.
export const CFG = {
  // City: 9 streets each way, 40 m apart, street centre lines at these coords.
  streets: [-160, -120, -80, -40, 0, 40, 80, 120, 160],
  streetHalf: 6, // half-width of the asphalt
  worldMin: -180,
  worldMax: 180,
  beachX: 184, // sand starts here
  waterX: 224, // sea plane starts here
  // Player on foot.
  walkSpeed: 6,
  runSpeed: 10.5,
  jumpSpeed: 7.5,
  gravity: 22,
  playerRadius: 0.7,
  playerHp: 100,
  // Cars.
  carAccel: 16,
  carBrake: 30,
  carMaxSpeed: 34,
  carMaxReverse: 10,
  carTurn: 1.9,
  carRadius: 1.6,
  trafficCount: 22,
  parkedCount: 12,
  // Pedestrians and police.
  pedCount: 36,
  beachPedCount: 10,
  pedWalkSpeed: 1.6,
  pedFleeSpeed: 5.5,
  copRunSpeed: 7.2,
  copCarSpeed: 30,
  // Wanted: heat 0..100; stars = ceil(heat / 20).
  wantedPerSteal: 34,
  wantedPerHitPed: 22,
  wantedPerShot: 12,
  wantedDecay: 1.6, // heat per second while unseen
  wantedMax: 100,
  // Combat.
  pistolDamage: 34,
  pistolMag: 12,
  pistolRange: 60,
  punchDamage: 20,
  punchRange: 2.4,
  reloadTime: 1.1,
  // Money.
  startMoney: 120,
  hospitalFine: 150,
  missionRewards: [500, 800, 1200, 5000],
  // Camera.
  camDist: 9,
  camHeight: 4.2,
};

export const SAVE_KEY = 'sunport-save-v1';
