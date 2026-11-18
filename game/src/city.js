// SUNPORT — the city of Sunport.
// A 9x9 street grid on a sunny coast: asphalt roads with dashed centre
// lines, sidewalks, towers with canvas-drawn windows, palm trees, street
// lamps, and a sand beach with the sea on the east side. Landmarks (the
// hospital, the garage, the bank, the safehouse) are fixed street corners
// the missions point at. Collision is a list of building boxes; the
// helpers below keep the player, cars and pedestrians out of them.
//
// Districts (original names): Palmera Boulevard along the beach (pastel
// art-deco hotels), Solmar Beach (sand, sea, lifeguard tower, umbrellas),
// Neon Strip (neon signs along the z=120 street), Downtown (glass towers),
// Rustport (warehouses, west edge), Cayo Verde (island across a bridge,
// backdrop). The marina, yachts, a flyover plane and drifting clouds make
// the city feel alive from any angle.
import * as THREE from 'three';
import { CFG } from './config.js';
import { registerGlow, glowTexture } from './daynight.js';

export const LANDMARKS = {
  hospital: { x: -168, z: -168, label: 'Sunport General Hospital' },
  garage: { x: 168, z: 168, label: "Rico's Garage" },
  bank: { x: 168, z: -168, label: 'Sunport First Bank' },
  safehouse: { x: -168, z: 168, label: 'Safehouse — Coral Court' },
  packageSpot: { x: -168, z: 40, label: 'Package pickup — Pier 9' },
};

// District lookup for the HUD: [x0, z0, x1, z1, name].
export const DISTRICTS = [
  [182, -180, 260, 180, 'Solmar Beach'],
  [148, -180, 182, 180, 'Palmera Boulevard'],
  [-80, 100, 160, 140, 'Neon Strip'],
  [-80, -80, 80, 80, 'Downtown'],
  [-180, 80, -120, 180, 'Rustport'],
  [260, 20, 340, 100, 'Cayo Verde'],
  [-180, -180, 180, 180, 'Sunport'],
];
export function districtAt(x, z) {
  for (const [x0, z0, x1, z1, name] of DISTRICTS) {
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return name;
  }
  return 'Sunport';
}

function windowTextures(rng, base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const e = document.createElement('canvas');
  e.width = 128; e.height = 256;
  const eg = e.getContext('2d');
  eg.fillStyle = '#000000';
  eg.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 244; y += 22) {
    for (let x = 10; x < 118; x += 22) {
      const on = rng.next() < 0.35;
      g.fillStyle = on ? lit : 'rgba(20, 34, 48, 0.9)';
      g.fillRect(x, y, 14, 14);
      if (on) { eg.fillStyle = lit; eg.fillRect(x, y, 14, 14); }
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(e);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

function roadTexture(horizontal = false) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#52575f';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e8d24a';
  if (horizontal) {
    // Dashes run along U (the road length for the east-west streets).
    g.fillRect(0, 30, 26, 4);
    g.fillRect(38, 30, 26, 4);
  } else {
    // Dashes run along V (the road length for the north-south streets).
    g.fillRect(30, 0, 4, 26);
    g.fillRect(30, 38, 4, 26);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function seaTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#19b8c4';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 10; i += 1) {
    const y = 8 + i * 13;
    g.beginPath();
    for (let x = 0; x <= 128; x += 8) {
      const yy = y + Math.sin((x / 128) * Math.PI * 2 + i) * 3;
      if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const buildings = []; // {x0,z0,x1,z1,h}
  const group = new THREE.Group();
  scene.add(group);
  const animated = { seaTex: null, foam: null, yachts: [], plane: null, clouds: [] };

  // Ground: grass-green base under the whole map.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0x7fae62 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(20, -0.05, 0);
  group.add(ground);

  // Roads: one dark strip per street, both directions. The dash texture
  // repeats along the road length (one dashed centre line per street).
  const roadTexV = roadTexture(false);
  const roadTexH = roadTexture(true);
  for (const s of CFG.streets) {
    const texV = roadTexV.clone();
    texV.needsUpdate = true;
    texV.repeat.set(1, 380 / 14);
    const mv = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 380),
      new THREE.MeshLambertMaterial({ map: texV }),
    );
    mv.rotation.x = -Math.PI / 2;
    mv.position.set(s, 0, 0);
    group.add(mv);
    const texH = roadTexH.clone();
    texH.needsUpdate = true;
    texH.repeat.set(380 / 14, 1);
    const mh = new THREE.Mesh(
      new THREE.PlaneGeometry(380, 13),
      new THREE.MeshLambertMaterial({ map: texH }),
    );
    mh.rotation.x = -Math.PI / 2;
    mh.position.set(0, 0, s);
    group.add(mh);
  }
  // Sidewalks: pale strips hugging each road.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb8b2a4 });
  for (const s of CFG.streets) {
    for (const [w, l, x, z] of [[3, 380, s + 8, 0], [3, 380, s - 8, 0], [380, 3, 0, s + 8], [380, 3, 0, s - 8]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), walkMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, z);
      group.add(m);
    }
  }

  // Buildings: 1-3 per block, varied height and colour, window texture
  // with a matching emissive map so windows light up at night.
  const pastel = ['#f2a7b8', '#a8d8c8', '#f7c9a0', '#f2e6c9', '#a8c8e8', '#e8b8d8', '#ffd9a0', '#b8e0d2'];
  const downtownGlass = ['#5a7a9a', '#4a6a8a', '#6a8aaa', '#3a5a7a'];
  const rust = ['#a85a3a', '#8a6a4a', '#7a5a48', '#9a6a3a'];
  const litPalette = ['#ffe9a8', '#bfe8ff', '#ffd9a0'];
  const blockCentres = [];
  for (const x of CFG.streets.slice(0, -1)) blockCentres.push(x + 20);
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      if (bx > 150) continue; // beach side stays open
      const downtown = Math.abs(bx) <= 80 && Math.abs(bz) <= 80;
      const rustport = bx < -120 && bz > 80;
      const n = downtown ? 1 + Math.floor(rng.next() * 2) : 1 + Math.floor(rng.next() * 3);
      for (let i = 0; i < n; i += 1) {
        const w = downtown ? rng.range(16, 24) : rustport ? rng.range(18, 28) : rng.range(10, 18);
        const d = downtown ? rng.range(16, 24) : rustport ? rng.range(14, 22) : rng.range(10, 18);
        const h = downtown ? rng.range(28, 58) : rustport ? rng.range(7, 12) : rng.range(9, 22);
        const x = bx + rng.range(-8, 8);
        const z = bz + rng.range(-8, 8);
        const base = downtown ? rng.pick(downtownGlass) : rustport ? rng.pick(rust) : rng.pick(pastel);
        const { map, emissive } = windowTextures(rng, base, rng.pick(litPalette));
        const mat = new THREE.MeshLambertMaterial({
          map, emissiveMap: emissive, emissive: 0xffc37a, emissiveIntensity: 0,
        });
        registerGlow('emissive', mat, 0, 0.9);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z);
        group.add(b);
        // Flat roof cap so the tower reads as a building from above.
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6),
          new THREE.MeshLambertMaterial({ color: downtown ? 0x2a3a4a : 0x5a5148 }),
        );
        roof.position.set(x, h + 0.4, z);
        group.add(roof);
        // Art-deco stepped crown on Palmera Boulevard hotels.
        if (bx > 120 && !downtown) {
          const crown = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.55, 2.2, d * 0.55),
            new THREE.MeshLambertMaterial({ color: base }),
          );
          crown.position.set(x, h + 1.9, z);
          group.add(crown);
          const fin = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 3.5, 0.8),
            new THREE.MeshLambertMaterial({ color: 0xffd24a }),
          );
          fin.position.set(x, h + 4.5, z);
          group.add(fin);
        }
        buildings.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h });
      }
    }
  }

  // Landmark signs: coloured roof boxes so each mission target is visible.
  const landmarkCols = { hospital: 0xffffff, garage: 0xff7f2a, bank: 0x2a7fff, safehouse: 0x39d353, packageSpot: 0xffd24a };
  for (const [key, lm] of Object.entries(LANDMARKS)) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(10, 3, 10),
      new THREE.MeshLambertMaterial({ color: landmarkCols[key] }),
    );
    sign.position.set(lm.x, 2, lm.z);
    group.add(sign);
    buildings.push({ x0: lm.x - 5, z0: lm.z - 5, x1: lm.x + 5, z1: lm.z + 5, h: 3.5 });
  }

  // Neon Strip: glowing sign boards on the buildings flanking z=120.
  const neonCols = [0xff2e88, 0x19e3ff, 0xffd24a, 0xc44dff, 0x39ff88];
  const glowTex = glowTexture();
  function neonSign(x, y, z, w, h, color, ry = 0) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x331122 });
    registerGlow('basic', mat, 0x331122, color);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), mat);
    sign.position.set(x, y, z);
    sign.rotation.y = ry;
    group.add(sign);
    const smat = new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, opacity: 0.05, depthWrite: false,
    });
    registerGlow('sprite', { material: smat }, 0.05, 0.75);
    const spr = new THREE.Sprite(smat);
    spr.scale.set(Math.max(w, h) * 3.2, Math.max(w, h) * 3.2, 1);
    spr.position.set(x, y, z + (ry === 0 ? 0.6 : -0.6));
    group.add(spr);
  }
  for (let i = 0; i < 10; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = -140 + i * 32 + rng.range(-6, 6);
    const z = 120 + side * 11;
    const color = neonCols[i % neonCols.length];
    neonSign(x, rng.range(6, 12), z, rng.range(4, 9), rng.range(1.2, 2.4), color, side > 0 ? Math.PI : 0);
    if (i % 3 === 0) neonSign(x + 6, 4, z, 1.2, rng.range(4, 7), neonCols[(i + 2) % neonCols.length], side > 0 ? Math.PI : 0);
  }

  // Palm trees along the beach and scattered on sidewalks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f });
  function palm(x, z, s = 1) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.32 * s, 6 * s, 6), trunkMat);
    trunk.position.y = 3 * s;
    t.add(trunk);
    for (let i = 0; i < 5; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 3.4 * s, 4), leafMat);
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.2 * s, 6.2 * s, Math.sin(a) * 1.2 * s);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      t.add(leaf);
    }
    t.position.set(x, 0, z);
    group.add(t);
  }
  for (let z = -170; z <= 170; z += 34) palm(CFG.beachX - 6, z, 1.2);
  for (let i = 0; i < 16; i += 1) {
    palm(rng.pick(CFG.streets) + 9, rng.range(-170, 170), rng.range(0.8, 1.1));
  }
  // Palmera Boulevard gets a row of tall palms.
  for (let z = -160; z <= 160; z += 20) palm(152, z, 1.35);

  // Street lamps on every other corner, with a glow sprite at night.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  for (const sx of CFG.streets) {
    for (const sz of CFG.streets) {
      if ((sx + sz) % 80 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), poleMat);
      pole.position.set(sx + 8, 3.5, sz + 8);
      group.add(pole);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0x555544 });
      registerGlow('basic', lampMat, 0x555544, 0xfff2b0);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
      lamp.position.set(sx + 8, 7.1, sz + 8);
      group.add(lamp);
      const smat = new THREE.SpriteMaterial({
        map: glowTex, color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false,
      });
      registerGlow('sprite', { material: smat }, 0, 0.55);
      const spr = new THREE.Sprite(smat);
      spr.scale.set(7, 7, 1);
      spr.position.set(sx + 8, 7.1, sz + 8);
      group.add(spr);
      // Pool of light on the asphalt below the lamp (night only).
      const poolMat = new THREE.MeshBasicMaterial({
        map: glowTex, color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false,
      });
      registerGlow('sprite', { material: poolMat }, 0, 0.32);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(sx + 8, 0.05, sz + 8);
      group.add(pool);
    }
  }

  // Beach sand and the turquoise sea, east of the city.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 380),
    new THREE.MeshLambertMaterial({ color: 0xe8d49a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CFG.beachX + 20, 0.01, 0);
  group.add(sand);
  animated.seaTex = seaTexture();
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 560),
    new THREE.MeshLambertMaterial({ map: animated.seaTex }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CFG.waterX + 60, 0.02, 0);
  group.add(sea);
  // Foam strip where the waves meet the sand.
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 380),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(CFG.waterX - 4, 0.04, 0);
  group.add(foam);
  animated.foam = foam;
  // Boardwalk planks along the sand edge.
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 360),
    new THREE.MeshLambertMaterial({ color: 0xa9805a }),
  );
  board.rotation.x = -Math.PI / 2;
  board.position.set(CFG.beachX - 2, 0.03, 0);
  group.add(board);

  // Beach umbrellas + lifeguard tower (yellow) on Solmar Beach.
  const umbrellaCols = [0xff2e88, 0x19e3ff, 0xffd24a, 0x39ff88, 0xff7f2a];
  for (let i = 0; i < 9; i += 1) {
    const ux = CFG.beachX + rng.range(8, 34);
    const uz = -150 + i * 36 + rng.range(-8, 8);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    pole.position.set(ux, 1.3, uz);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 1.0, 8),
      new THREE.MeshLambertMaterial({ color: umbrellaCols[i % umbrellaCols.length] }),
    );
    top.position.set(ux, 2.9, uz);
    group.add(pole, top);
  }
  const tower = new THREE.Group();
  const towerMat = new THREE.MeshLambertMaterial({ color: 0xffd24a });
  for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 6), towerMat);
    leg.position.set(lx, 2, lz);
    tower.add(leg);
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 3), towerMat);
  cabin.position.y = 5;
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), new THREE.MeshLambertMaterial({ color: 0xff5544 }));
  towerRoof.position.y = 6.7;
  towerRoof.rotation.y = Math.PI / 4;
  tower.add(cabin, towerRoof);
  tower.position.set(CFG.beachX + 14, 0, -40);
  group.add(tower);

  // Marina: a pier into the sea and yachts bobbing beside it.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(52, 0.6, 6), pierMat);
  pier.position.set(CFG.waterX + 24, 0.4, -60);
  group.add(pier);
  for (let i = 0; i < 6; i += 1) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 6), pierMat);
    post.position.set(CFG.waterX + 4 + i * 9, 0, -63);
    group.add(post);
  }
  function yacht(x, z) {
    const y = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(3, 1.2, 9),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, metalness: 0.4 }),
    );
    hull.position.y = 0.6;
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.4, 4),
      new THREE.MeshStandardMaterial({ color: 0x2a6a8a, roughness: 0.35, metalness: 0.3 }),
    );
    cab.position.set(0, 1.8, -0.5);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), pierMat);
    mast.position.set(0, 5, 0.5);
    y.add(hull, cab, mast);
    y.position.set(x, 0, z);
    y.rotation.y = rng.range(-0.3, 0.3);
    group.add(y);
    animated.yachts.push(y);
    return y;
  }
  yacht(CFG.waterX + 18, -78);
  yacht(CFG.waterX + 30, -44);
  yacht(CFG.waterX + 16, -30);

  // Bridge to Cayo Verde island (backdrop across the water).
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x9a9a92 });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(90, 1, 8), bridgeMat);
  bridge.position.set(268, 3, 60);
  group.add(bridge);
  for (let i = 0; i < 7; i += 1) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), bridgeMat);
    pillar.position.set(230 + i * 13, 1, 60);
    group.add(pillar);
  }
  const island = new THREE.Mesh(
    new THREE.CircleGeometry(20, 24),
    new THREE.MeshLambertMaterial({ color: 0xe8d49a }),
  );
  island.rotation.x = -Math.PI / 2;
  island.position.set(318, 0.05, 60);
  group.add(island);
  for (let i = 0; i < 5; i += 1) palm(310 + rng.range(-10, 10), 52 + rng.range(-8, 8), 1.1);
  for (const [hx, hz] of [[314, 66], [322, 54]]) {
    const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), new THREE.MeshLambertMaterial({ color: 0xd8c9a3 }));
    hut.position.set(hx, 1.5, hz);
    const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2, 4), new THREE.MeshLambertMaterial({ color: 0x8a6b48 }));
    hutRoof.position.set(hx, 4, hz);
    hutRoof.rotation.y = Math.PI / 4;
    group.add(hut, hutRoof);
  }

  // A flyover plane + drifting clouds for the Florida sky.
  const plane = new THREE.Group();
  const planeMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 14, 8), planeMat);
  fus.rotation.z = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 16), planeMat);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 5), planeMat);
  tail.position.x = -6;
  plane.add(fus, wing, tail);
  plane.position.set(-280, 95, -120);
  scene.add(plane);
  animated.plane = plane;
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
  for (let i = 0; i < 6; i += 1) {
    const cl = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(4, 8), 8, 6), cloudMat);
      puff.position.set(j * 6 - 6, rng.range(-1, 1), rng.range(-2, 2));
      puff.scale.y = 0.45;
      cl.add(puff);
    }
    cl.position.set(rng.range(-200, 200), rng.range(70, 110), rng.range(-200, 200));
    scene.add(cl);
    animated.clouds.push(cl);
  }

  // Waypoint beacon: a tall glowing column the missions move around.
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3, 0.25, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd24a }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  beacon.add(beam, ring);
  beacon.visible = false;
  scene.add(beacon);

  function collideCircle(p, r) {
    for (const b of buildings) {
      const cx = Math.max(b.x0, Math.min(p.x, b.x1));
      const cz = Math.max(b.z0, Math.min(p.z, b.z1));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else if (d2 <= 1e-8) {
        p.x += r; // dead centre of a box: shove out along +x
      }
    }
    p.x = Math.max(CFG.worldMin, Math.min(CFG.waterX - 2, p.x));
    p.z = Math.max(CFG.worldMin, Math.min(CFG.worldMax, p.z));
  }

  function nearestStreet(v) {
    let best = CFG.streets[0];
    let bd = Infinity;
    for (const s of CFG.streets) {
      const d = Math.abs(s - v);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  let animT = 0;
  function update(dt) {
    animT += dt;
    if (animated.seaTex) animated.seaTex.offset.x += dt * 0.015;
    if (animated.foam) animated.foam.material.opacity = 0.22 + Math.sin(animT * 0.8) * 0.13;
    for (let i = 0; i < animated.yachts.length; i += 1) {
      const y = animated.yachts[i];
      y.position.y = Math.sin(animT * 0.9 + i * 2.1) * 0.25;
      y.rotation.z = Math.sin(animT * 0.7 + i) * 0.02;
    }
    if (animated.plane) {
      animated.plane.position.x += dt * 14;
      if (animated.plane.position.x > 320) animated.plane.position.x = -320;
    }
    for (let i = 0; i < animated.clouds.length; i += 1) {
      const cl = animated.clouds[i];
      cl.position.x += dt * (0.6 + i * 0.15);
      if (cl.position.x > 260) cl.position.x = -260;
    }
  }

  return { buildings, beacon, collideCircle, nearestStreet, update };
}
