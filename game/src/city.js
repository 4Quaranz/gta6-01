// SUNPORT v2 — the city. A neat road grid with consistent blocks: every
// building sits aligned inside its block with the same setback, and every
// district looks different — pastel Art Deco hotels on Palmera Boulevard,
// glass towers Downtown, low neon shops on the Neon Strip, warehouses in
// Rustport. Buildings are never plain boxes: stepped roofs, balconies,
// canopies, 3D neon signs, AC units, antennas, billboards, a gateway arch
// and a monument give the streets real geometry. All textures are drawn
// on canvas at build time; nothing is loaded over the network.

import * as THREE from 'three';
import {
  WORLD, ROADS_X, ROADS_Z, ROAD_W, SIDEWALK_W, GARAGE,
  HOTEL_COLORS, TOWER_COLORS, WAREHOUSE_COLORS, districtAt,
} from './config.js';
import { clamp } from './config.js';

// ---------------------------------------------------------------------------
// Small geometry helpers
// ---------------------------------------------------------------------------

// Merge several transformed geometries into one (all converted to
// non-indexed first), so a palm crown or a cloud is a single mesh.
export function mergeGeoms(items) {
  const pos = [];
  const norm = [];
  const uv = [];
  for (const { geo, matrix } of items) {
    const g = geo.clone().applyMatrix4(matrix);
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...ng.attributes.position.array);
    norm.push(...ng.attributes.normal.array);
    if (ng.attributes.uv) uv.push(...ng.attributes.uv.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  if (uv.length) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

function mat4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  return m;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const unitCone = new THREE.ConeGeometry(0.5, 1, 6);
const unitSphere = new THREE.SphereGeometry(0.5, 10, 8);

const matCache = new Map();
export function stdMat(color, opts = {}) {
  const key = `${color}|${opts.roughness ?? 0.85}|${opts.metalness ?? 0}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0,
    }));
  }
  return matCache.get(key);
}

export function box(w, h, d, x, y, z, mat, parent, castShadow = true) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

function cyl(rt, rb, h, x, y, z, mat, parent, seg = 10) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Canvas textures (all drawn at build time)
// ---------------------------------------------------------------------------

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function hexCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

// One facade texture per colour + floor count: window grid with frames,
// some windows warm-lit so they glow at night through the emissive map.
function facadeTexture(baseHex, floors, cols) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = hexCss(baseHex);
    g.fillRect(0, 0, 256, 256);
    // Subtle vertical shading strips for depth.
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < cols; i += 2) g.fillRect((i * 256) / cols, 0, 256 / cols / 2, 256);
    const ww = 256 / cols;
    const wh = 256 / floors;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const x = c * ww + ww * 0.22;
        const y = f * wh + wh * 0.25;
        const w = ww * 0.56;
        const h = wh * 0.5;
        // Frame, slightly proud of the wall.
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(x - 2, y - 2, w + 4, h + 4);
        // Glass: dark by day, a few warm-lit.
        const lit = ((f * 7 + c * 3) % 5) === 0;
        g.fillStyle = lit ? '#ffd98a' : '#1d2f45';
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(x, y, w, h * 0.3);
      }
    }
    // Ground-floor shopfront band.
    g.fillStyle = 'rgba(20,24,30,0.85)';
    g.fillRect(0, 256 - wh * 0.7, 256, wh * 0.7);
    g.fillStyle = '#ffd24a';
    g.fillRect(0, 256 - wh * 0.7, 256, 4);
  });
}

function signTexture(text, fg, bg) {
  return canvasTex(256, 64, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = fg;
    g.lineWidth = 4;
    g.strokeRect(4, 4, 248, 56);
    g.fillStyle = fg;
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
  });
}

function billboardTexture(lines, bg, fg) {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.font = 'bold 64px system-ui, sans-serif';
    g.fillText(lines[0], 256, 100);
    g.font = 'bold 34px system-ui, sans-serif';
    g.fillText(lines[1], 256, 170);
    g.fillStyle = '#ffd24a';
    g.fillRect(60, 200, 392, 8);
  });
}

// The whole ground plan in one canvas: grass, sidewalk borders around
// every block, asphalt roads with dashed centre lines, crosswalks at
// intersections, the sand band and a plaza. One plane, one texture.
function groundTexture() {
  const W = 2048;
  const H = 2048;
  // World area drawn: x -240..228, z -240..260 (468 x 500 m).
  const x0 = -240;
  const z0 = -240;
  const sx = W / 468;
  const sz = H / 500;
  const X = (x) => (x - x0) * sx;
  const Z = (z) => (z - z0) * sz;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#5d8a4a';
    g.fillRect(0, 0, W, H);
    // Mown-grass speckle.
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
      g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
    }
    // Sand band along the beach.
    g.fillStyle = '#eed9a4';
    g.fillRect(X(196), 0, X(228) - X(196), H);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = 'rgba(180,150,90,0.25)';
      g.fillRect(X(196) + Math.random() * (X(228) - X(196)), Math.random() * H, 3, 3);
    }
    // Sidewalk border around every block (light concrete).
    const hw = ROAD_W / 2 + SIDEWALK_W;
    for (let i = 0; i < ROADS_X.length - 1; i++) {
      for (let j = 0; j < ROADS_Z.length - 1; j++) {
        const ax = ROADS_X[i] + hw;
        const az = ROADS_Z[j] + hw;
        const bx = ROADS_X[i + 1] - hw;
        const bz = ROADS_Z[j + 1] - hw;
        g.fillStyle = '#9aa0a3';
        g.fillRect(X(ax), Z(az), X(bx) - X(ax), Z(bz) - Z(az));
      }
    }
    // Downtown plaza block (between -120..-80, -120..-80): pale paving.
    g.fillStyle = '#c9bda6';
    g.fillRect(X(-120 + hw), Z(-120 + hw), X(-80 - hw) - X(-120 + hw), Z(-80 - hw) - Z(-120 + hw));
    // Asphalt roads.
    g.fillStyle = '#2e3138';
    for (const rx of ROADS_X) g.fillRect(X(rx - ROAD_W / 2), 0, ROAD_W * sx, H);
    for (const rz of ROADS_Z) g.fillRect(0, Z(rz - ROAD_W / 2), W, ROAD_W * sz);
    // Yellow dashed centre lines.
    g.fillStyle = '#e8c832';
    for (const rx of ROADS_X) {
      for (let z = -230; z < 250; z += 12) g.fillRect(X(rx) - 1, Z(z), 2, 6 * sz);
    }
    for (const rz of ROADS_Z) {
      for (let x = -230; x < 220; x += 12) g.fillRect(X(x), Z(rz) - 1, 6 * sx, 2);
    }
    // Crosswalk stripes at every intersection.
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const rx of ROADS_X) {
      for (const rz of ROADS_Z) {
        for (let k = -2; k <= 2; k++) {
          g.fillRect(X(rx - 4 + k * 1.6), Z(rz - ROAD_W / 2 - 2.4), 1.1 * sx, 2.4 * sz);
          g.fillRect(X(rx - 4 + k * 1.6), Z(rz + ROAD_W / 2), 1.1 * sx, 2.4 * sz);
        }
      }
    }
    // Parking bays beside Rico's Garage.
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      g.strokeRect(X(164 + k * 5), Z(148), 4.4 * sx, 9 * sz);
    }
  });
}

function seaTexture() {
  const tex = canvasTex(256, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, '#19b8c4');
    grad.addColorStop(1, '#0a6f7d');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const y = i * 26 + 8;
      g.beginPath();
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.06 + i) * 5);
      g.stroke();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 8);
  return tex;
}

// ---------------------------------------------------------------------------
// Building makers — each returns its footprint for the collider list
// ---------------------------------------------------------------------------

function makeFacadeMats(rng, baseHex, floors, cols, glowList) {
  const tex = facadeTexture(baseHex, floors, cols);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.9, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0,
  });
  glowList.push(mat);
  return mat;
}

export function buildCity(scene, rng) {
  const city = {
    group: new THREE.Group(),
    colliders: [],
    palms: [],
    clouds: [],
    neons: [],
    streetPools: [],
    windowMats: [],
    seaMat: null,
    foam: [],
    yachts: [],
    lighthouseBeam: null,
    plane: null,
    spawn: { x: 190, z: 32, yaw: -Math.PI / 2 },
    parkedSpots: [],
  };
  scene.add(city.group);
  const G = city.group;

  // --- Ground: one textured plane for the whole plan -----------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(468, 500),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-6, 0, 10);
  ground.receiveShadow = true;
  G.add(ground);

  // --- Sea (animated texture) + foam strips at the shoreline --------------
  const seaTex = seaTexture();
  city.seaMat = seaTex;
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 500),
    new THREE.MeshStandardMaterial({ map: seaTex, roughness: 0.35, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(228 + 70, -0.4, 10);
  sea.receiveShadow = true;
  G.add(sea);
  for (let i = 0; i < 3; i++) {
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 500),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(227 + i * 1.6, -0.2 + i * 0.05, 10);
    G.add(foam);
    city.foam.push({ mesh: foam, phase: i * 2.1 });
  }

  // --- Helpers for neat blocks --------------------------------------------
  // Block (i, j) spans between roads i..i+1 and j..j+1; the buildable lot
  // is inset by a consistent 2 m from the sidewalk edge.
  function blockLot(i, j) {
    const inset = ROAD_W / 2 + SIDEWALK_W + 2;
    return {
      x0: ROADS_X[i] + inset,
      z0: ROADS_Z[j] + inset,
      x1: ROADS_X[i + 1] - inset,
      z1: ROADS_Z[j + 1] - inset,
      cx: (ROADS_X[i] + ROADS_X[i + 1]) / 2,
      cz: (ROADS_Z[j] + ROADS_Z[j + 1]) / 2,
    };
  }

  function addCollider(x0, z0, x1, z1) {
    city.colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  }

  // Rooftop clutter: AC boxes + a water tank, always aligned to the roof.
  function rooftop(x, z, w, d, y, rngLocal) {
    const acMat = stdMat(0x8b9096, { roughness: 0.9 });
    const n = 1 + Math.floor(rngLocal.next() * 2);
    for (let k = 0; k < n; k++) {
      box(1.6, 0.9, 1.2, x + (rngLocal.next() - 0.5) * (w - 3), y + 0.45, z + (rngLocal.next() - 0.5) * (d - 3), acMat, G);
    }
    if (rngLocal.next() < 0.5) {
      cyl(0.9, 0.9, 2.2, x + w * 0.28, y + 1.1, z - d * 0.25, stdMat(0x7a6a55), G, 8);
      box(w * 0.3, 0.3, d * 0.3, x + w * 0.28, y + 2.3, z - d * 0.25, stdMat(0x5d5347), G);
    }
  }

  function neonSign(x, y, z, ry, text, colorHex) {
    const tex = signTexture(text, '#ffffff', '#111111');
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const sign = box(0.35, 2.2, 4.2, x, y, z, mat, G);
    sign.rotation.y = ry;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(signGlowCanvas(colorHex)),
      color: colorHex, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(7, 4, 1);
    glow.position.copy(sign.position);
    G.add(glow);
    city.neons.push({ mat, glowMat: glow.material, base: 0.55, phase: rng.next() * 6, flicker: rng.next() < 0.25 });
    return sign;
  }

  function signGlowCanvas(colorHex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  // --- Buildings, block by block ------------------------------------------
  const hotelTexCache = new Map();
  function hotelMat(color, floors) {
    const key = `${color}|${floors}`;
    if (!hotelTexCache.has(key)) {
      hotelTexCache.set(key, makeFacadeMats(rng, color, floors, 6, city.windowMats));
    }
    return hotelTexCache.get(key);
  }

  function buildTower(lot, h) {
    const w = 16;
    const d = 16;
    const color = rng.pick(TOWER_COLORS);
    const mat = makeFacadeMats(rng, color, Math.max(6, Math.floor(h / 4)), 5, city.windowMats);
    box(w, h, d, lot.cx, h / 2, lot.cz, mat, G);
    // Stepped crown: two setbacks + parapet.
    box(w * 0.7, 3, d * 0.7, lot.cx, h + 1.5, lot.cz, stdMat(0x22303f, { roughness: 0.7 }), G);
    box(w * 0.45, 2, d * 0.45, lot.cx, h + 4, lot.cz, stdMat(0x1a2531), G);
    box(w + 0.6, 0.5, d + 0.6, lot.cx, h + 0.2, lot.cz, stdMat(0x18222e), G);
    rooftop(lot.cx, lot.cz, w * 0.6, d * 0.6, h + 5, rng);
    cyl(0.12, 0.12, 7, lot.cx + w * 0.2, h + 8, lot.cz, stdMat(0x888888, { metalness: 0.6 }), G, 6);
    addCollider(lot.cx - w / 2, lot.cz - d / 2, lot.cx + w / 2, lot.cz + d / 2);
  }

  function buildHotel(lot, floors, color) {
    const w = 10;
    const d = 9;
    // Two hotels side by side along the avenue, same setback, same gap.
    const mat = hotelMat(color, floors);
    const h = floors * 3.2 + 1;
    box(w, h, d, lot.cx, h / 2, lot.cz, mat, G);
    // Stepped roof: two receding slabs + parapet.
    box(w * 0.85, 1.1, d * 0.85, lot.cx, h + 0.55, lot.cz, stdMat(0xefe6d8), G);
    box(w * 0.6, 1.1, d * 0.6, lot.cx, h + 1.6, lot.cz, stdMat(0xe2d7c4), G);
    box(w + 0.4, 0.4, d + 0.4, lot.cx, h + 0.2, lot.cz, stdMat(0xd8cdb8), G);
    // Balconies on the sea-facing side (east), one slab per floor.
    const balMat = stdMat(0xf5efe2);
    for (let f = 1; f < floors; f++) {
      const y = f * 3.2 + 0.4;
      box(0.9, 0.25, 2.6, lot.cx + w / 2 + 0.45, y, lot.cz - d / 4, balMat, G);
      box(0.9, 0.25, 2.6, lot.cx + w / 2 + 0.45, y, lot.cz + d / 4, balMat, G);
      box(0.08, 1.0, 2.6, lot.cx + w / 2 + 0.9, y + 0.6, lot.cz - d / 4, stdMat(0x333333, { metalness: 0.5 }), G);
      box(0.08, 1.0, 2.6, lot.cx + w / 2 + 0.9, y + 0.6, lot.cz + d / 4, stdMat(0x333333, { metalness: 0.5 }), G);
    }
    // Entrance canopy over the sidewalk.
    box(3.2, 0.3, 5, lot.cx + w / 2 + 1.4, 3.1, lot.cz, stdMat(0x2e4a6b, { roughness: 0.6 }), G);
    box(0.25, 3.0, 0.25, lot.cx + w / 2 + 2.8, 1.5, lot.cz - 2.2, stdMat(0x444444, { metalness: 0.5 }), G);
    box(0.25, 3.0, 0.25, lot.cx + w / 2 + 2.8, 1.5, lot.cz + 2.2, stdMat(0x444444, { metalness: 0.5 }), G);
    // Vertical neon sign on the corner.
    neonSign(lot.cx + w / 2 + 0.4, h * 0.55, lot.cz - d / 2 - 0.3, 0, 'HOTEL', 0xff2e88);
    // A few protruding window AC units on the street face.
    for (let f = 1; f < floors; f += 2) {
      box(0.5, 0.5, 0.9, lot.cx - w / 2 - 0.25, f * 3.2, lot.cz, stdMat(0x9aa0a3), G);
    }
    addCollider(lot.cx - w / 2, lot.cz - d / 2, lot.cx + w / 2, lot.cz + d / 2);
  }

  function buildShop(lot, kind) {
    const w = 9;
    const d = 11;
    const h = kind === 'club' ? 7 : 5;
    const base = kind === 'club' ? 0x3a2a4a : rng.pick([0xc96a4a, 0x4a7a6a, 0x8a5a7a, 0x5a6a8a]);
    const mat = makeFacadeMats(rng, base, 2, 4, city.windowMats);
    box(w, h, d, lot.cx, h / 2, lot.cz, mat, G);
    box(w + 0.4, 0.5, d + 0.4, lot.cx, h + 0.2, lot.cz, stdMat(0x222222), G);
    // Shopfront canopy, angled down toward the street.
    const canopy = box(3.4, 0.25, w * 0.9, lot.cx + w / 2 + 1.5, 3.0, lot.cz, stdMat(0x222831, { roughness: 0.6 }), G);
    canopy.rotation.z = -0.18;
    // Big 3D sign jutting out over the sidewalk.
    const label = kind === 'club' ? 'CLUB' : kind === 'bar' ? 'BAR' : 'SHOP';
    const color = kind === 'club' ? 0xff2e88 : kind === 'bar' ? 0x19e3ff : 0xffd24a;
    neonSign(lot.cx + w / 2 + 1.2, h - 0.6, lot.cz, 0, label, color);
    // Roof billboard on every second shop.
    if (rng.next() < 0.5) {
      const tex = billboardTexture(['NEON', 'STRIP'], '#14181f', '#ff2e88');
      const panel = box(0.4, 3.2, 7, lot.cx, h + 2.2, lot.cz, new THREE.MeshBasicMaterial({ map: tex }), G);
      panel.rotation.y = Math.PI / 2;
      box(0.3, 1.2, 0.3, lot.cx - 2, h + 0.6, lot.cz, stdMat(0x555555, { metalness: 0.6 }), G);
      box(0.3, 1.2, 0.3, lot.cx + 2, h + 0.6, lot.cz, stdMat(0x555555, { metalness: 0.6 }), G);
    }
    addCollider(lot.cx - w / 2, lot.cz - d / 2, lot.cx + w / 2, lot.cz + d / 2);
  }

  function buildWarehouse(lot) {
    const w = 14;
    const d = 10;
    const h = 8;
    const color = rng.pick(WAREHOUSE_COLORS);
    box(w, h, d, lot.cx, h / 2, lot.cz, stdMat(color, { roughness: 0.95 }), G);
    // Raised centre strip on the roof (sawtooth hint) + parapet.
    box(w * 0.5, 1.6, d * 0.8, lot.cx, h + 0.8, lot.cz, stdMat(0x6a5f52), G);
    box(w + 0.4, 0.4, d + 0.4, lot.cx, h + 0.2, lot.cz, stdMat(0x555049), G);
    // Silo cylinders on the east side, inside the lot.
    cyl(1.6, 1.6, 11, lot.cx + 7.8, 5.5, lot.cz - 3.5, stdMat(0xb8bcc0, { metalness: 0.4 }), G, 12);
    cyl(1.6, 1.6, 9, lot.cx + 7.8, 4.5, lot.cz + 3.5, stdMat(0xa8adb2, { metalness: 0.4 }), G, 12);
    // Loading dock platform on the south side.
    box(8, 1.1, 4, lot.cx, 0.55, lot.cz + d / 2 + 2, stdMat(0x7d7d7d), G);
    // Container stacks, neatly aligned on the north side.
    const contColors = [0xc65a3a, 0x3a7ac6, 0x4a9a5a, 0xd8a03a];
    box(6, 2.6, 2.6, lot.cx - 4, 1.3, lot.cz - 8, stdMat(contColors[0], { roughness: 0.8 }), G);
    box(6, 2.6, 2.6, lot.cx + 3, 1.3, lot.cz - 8, stdMat(contColors[1], { roughness: 0.8 }), G);
    box(6, 2.6, 2.6, lot.cx - 4, 3.9, lot.cz - 8, stdMat(contColors[2], { roughness: 0.8 }), G);
    addCollider(lot.cx - 7, lot.cz - 9.3, lot.cx + 9.4, lot.cz + 9);
  }

  function buildApartment(lot, floors) {
    const w = 12;
    const d = 12;
    const h = floors * 3 + 1;
    const color = rng.pick([0xd8c9a8, 0xc9b8a8, 0xb8c4cc, 0xd8a8a8]);
    const mat = makeFacadeMats(rng, color, floors, 4, city.windowMats);
    box(w, h, d, lot.cx, h / 2, lot.cz, mat, G);
    box(w * 0.8, 1, d * 0.8, lot.cx, h + 0.5, lot.cz, stdMat(0xcfc4ae), G);
    box(w + 0.4, 0.4, d + 0.4, lot.cx, h + 0.2, lot.cz, stdMat(0xbfae92), G);
    rooftop(lot.cx, lot.cz, w * 0.7, d * 0.7, h + 1, rng);
    addCollider(lot.cx - w / 2, lot.cz - d / 2, lot.cx + w / 2, lot.cz + d / 2);
  }

  // Rico's Garage — mission 1 target, at the south-east corner lot.
  function buildGarage(lot) {
    const w = 14;
    const d = 10;
    const h = 6;
    box(w, h, d, lot.cx, h / 2, lot.cz, stdMat(0xb8643a, { roughness: 0.9 }), G);
    box(w + 0.4, 0.5, d + 0.4, lot.cx, h + 0.2, lot.cz, stdMat(0x8a4a2a), G);
    // Big roller door facing the road.
    box(0.3, 4.2, 7, lot.cx - w / 2 - 0.1, 2.1, lot.cz, stdMat(0x3a3f45, { metalness: 0.5 }), G);
    neonSign(lot.cx - w / 2 - 0.6, h + 0.4, lot.cz, Math.PI / 2, 'GARAGE', 0xffd24a);
    // Tyre stack beside the door.
    for (let k = 0; k < 3; k++) {
      cyl(0.7, 0.7, 0.35, lot.cx - w / 2 - 2, 0.2 + k * 0.36, lot.cz + d / 2 - 1, stdMat(0x1a1a1a, { roughness: 1 }), G, 10);
    }
    addCollider(lot.cx - w / 2, lot.cz - d / 2, lot.cx + w / 2, lot.cz + d / 2);
  }

  // Walk the grid, one neat lot per block.
  for (let i = 0; i < ROADS_X.length - 1; i++) {
    for (let j = 0; j < ROADS_Z.length - 1; j++) {
      const lot = blockLot(i, j);
      const district = districtAt(lot.cx, lot.cz);
      if (lot.cx > 190) continue; // beach / sea: no buildings
      // Downtown plaza: monument instead of a tower.
      if (district === 'DOWNTOWN' && lot.cx === -100 && lot.cz === -100) continue;
      // Garage lot (south-east corner, beside the (168,160) target).
      if (lot.cx === 180 && lot.cz === 140) { buildGarage(lot); continue; }
      if (district === 'DOWNTOWN') {
        buildTower(lot, 30 + rng.range(0, 38));
      } else if (district === 'PALMERA BLVD') {
        // Two hotels per block, split along the avenue with a fixed gap.
        const sub1 = { ...lot, cx: lot.cx, cz: lot.cz - 5.5 };
        const sub2 = { ...lot, cx: lot.cx, cz: lot.cz + 5.5 };
        buildHotel(sub1, 3 + Math.floor(rng.next() * 3), rng.pick(HOTEL_COLORS));
        buildHotel(sub2, 3 + Math.floor(rng.next() * 3), rng.pick(HOTEL_COLORS));
      } else if (district === 'NEON STRIP') {
        const kinds = ['club', 'bar', 'shop'];
        const sub1 = { ...lot, cx: lot.cx - 5, cz: lot.cz };
        const sub2 = { ...lot, cx: lot.cx + 5, cz: lot.cz };
        buildShop(sub1, rng.pick(kinds));
        buildShop(sub2, rng.pick(kinds));
      } else if (district === 'RUSTPORT') {
        buildWarehouse(lot);
      } else if (district === 'MARINA') {
        buildApartment(lot, 2 + Math.floor(rng.next() * 2));
      } else {
        buildApartment(lot, 3 + Math.floor(rng.next() * 3));
      }
    }
  }

  // --- Downtown plaza monument ---------------------------------------------
  {
    const px = -100;
    const pz = -100;
    box(14, 0.6, 14, px, 0.3, pz, stdMat(0xc9bda6), G, false);
    box(8, 0.8, 8, px, 1.0, pz, stdMat(0xb5a888), G);
    box(4, 0.8, 4, px, 1.8, pz, stdMat(0xa89878), G);
    const ob = cyl(0.4, 1.4, 12, px, 8, pz, stdMat(0xd8cdb8), G, 4);
    ob.rotation.y = Math.PI / 4;
    const orb = new THREE.Mesh(unitSphere, stdMat(0xffd24a, { metalness: 0.6, roughness: 0.3 }));
    orb.scale.set(1.6, 1.6, 1.6);
    orb.position.set(px, 14.6, pz);
    G.add(orb);
    addCollider(px - 7, pz - 7, px + 7, pz + 7);
  }

  // --- Gateway arch over Palmera Boulevard ----------------------------------
  {
    const ax = 200;
    const az = 0;
    const pillarMat = stdMat(0xf5efe2);
    box(1.6, 11, 1.6, ax, 5.5, az - 6, pillarMat, G);
    box(1.6, 11, 1.6, ax, 5.5, az + 6, pillarMat, G);
    const beamTex = signTexture('SUNPORT', '#ffd24a', '#14181f');
    const beam = box(2.2, 2.4, 14.5, ax, 11.5, az, new THREE.MeshBasicMaterial({ map: beamTex }), G);
    beam.rotation.y = 0;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(signGlowCanvas(0xffd24a)),
      color: 0xffd24a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(16, 5, 1);
    glow.position.set(ax, 11.5, az);
    G.add(glow);
    city.neons.push({ mat: beam.material, glowMat: glow.material, base: 0.5, phase: 1.2, flicker: false });
    addCollider(ax - 1.2, az - 6.8, ax + 1.2, az - 5.2);
    addCollider(ax - 1.2, az + 5.2, ax + 1.2, az + 6.8);
  }

  // --- Bridge to Cayo Verde + island ---------------------------------------
  // The deck top is at y = 0: cars and walkers all move at y = 0, so a
  // raised deck would bury them inside the box (invisible from the chase
  // camera). The deck is a low causeway 0.4 above the sea (-0.4); the
  // pillars sink into the water and the rails sit just above the deck.
  {
    const deckMat = stdMat(0x6a6f75, { roughness: 0.9 });
    box(84, 1, 12, 270, -0.5, 0, deckMat, G);
    box(84, 0.5, 0.5, 270, 0.4, -6, stdMat(0x3a3f45, { metalness: 0.5 }), G);
    box(84, 0.5, 0.5, 270, 0.4, 6, stdMat(0x3a3f45, { metalness: 0.5 }), G);
    for (let k = 0; k < 4; k++) {
      cyl(1.2, 1.5, 4, 240 + k * 22, -2, 0, stdMat(0x7d838a), G, 8);
    }
    // Island: sand disc flush with the driving surface (top y = 0), so
    // cars on the island sit on the sand instead of sinking into it.
    const island = cyl(16, 18, 1.2, 322, -0.6, 0, stdMat(0xeed9a4), G, 20);
    island.receiveShadow = true;
    const houseMat = makeFacadeMats(rng, 0xf2e6c8, 1, 3, city.windowMats);
    box(6, 4, 5, 318, 2, -6, houseMat, G);
    const roof1 = new THREE.Mesh(unitCone, stdMat(0xb8643a));
    roof1.scale.set(7.5, 3, 6.5);
    roof1.position.set(318, 5.5, -6);
    roof1.rotation.y = Math.PI / 4;
    G.add(roof1);
    box(6, 4, 5, 322, 2, 6, houseMat, G);
    const roof2 = new THREE.Mesh(unitCone, stdMat(0x3a6a8a));
    roof2.scale.set(7.5, 3, 6.5);
    roof2.position.set(322, 5.5, 6);
    roof2.rotation.y = Math.PI / 4;
    G.add(roof2);
    // Lighthouse with a rotating beam (spun by daynight at night).
    cyl(1.8, 2.4, 14, 326, 7, -2, stdMat(0xf5f0e6), G, 12);
    cyl(1.4, 1.4, 2, 326, 14.6, -2, stdMat(0x222831), G, 12);
    const beam = new THREE.Mesh(unitCone, new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    beam.scale.set(3, 18, 3);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(326, 15, -2);
    G.add(beam);
    city.lighthouseBeam = beam;
    addCollider(314, -8, 330, 8);
  }

  // --- Marina pier + yachts -------------------------------------------------
  {
    const pierMat = stdMat(0x8a6f5c, { roughness: 0.95 });
    box(24, 0.8, 5, 214, 0.4, -80, pierMat, G);
    box(5, 0.8, 18, 226, 0.4, -72, pierMat, G);
    for (let k = 0; k < 3; k++) {
      const y = new THREE.Group();
      const hull = box(8, 1.6, 3, 0, 0.4, 0, stdMat(0xf5f5f5, { roughness: 0.4 }), y);
      hull.scale.set(1, 1, 1);
      box(4, 1.6, 2.4, -0.5, 1.8, 0, stdMat(0x3a6a8a, { roughness: 0.5 }), y);
      cyl(0.12, 0.12, 6, 1.5, 4, 0, stdMat(0xcccccc, { metalness: 0.6 }), y, 6);
      y.position.set(210 + k * 9, -0.2, -92 - k * 4);
      y.rotation.y = 0.3 + k * 0.2;
      G.add(y);
      city.yachts.push({ group: y, phase: k * 2.4 });
    }
  }

  // --- Lifeguard tower + beach umbrellas (Solmar Beach) -------------------
  {
    const tx = 212;
    const tz = 0;
    const legMat = stdMat(0xf2c200, { roughness: 0.8 });
    for (const [dx, dz] of [[-1.4, -1.2], [1.4, -1.2], [-1.4, 1.2], [1.4, 1.2]]) {
      box(0.3, 3.4, 0.3, tx + dx, 1.7, tz + dz, legMat, G);
    }
    box(3.6, 0.3, 3.2, tx, 3.5, tz, stdMat(0xffffff), G);
    box(3.6, 1.0, 0.3, tx, 4.1, tz - 1.6, legMat, G);
    const roof = new THREE.Mesh(unitCone, stdMat(0xff2e3a, { roughness: 0.7 }));
    roof.scale.set(5, 1.6, 4.4);
    roof.position.set(tx, 5.6, tz);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    G.add(roof);
    const ramp = box(1.2, 0.2, 4.5, tx, 1.6, tz + 3.6, stdMat(0xf2c200), G);
    ramp.rotation.x = 0.5;
    addCollider(tx - 1.8, tz - 1.6, tx + 1.8, tz + 1.6);
    // Nine colourful umbrellas scattered along the sand.
    const umbColors = [0xff2e88, 0x19e3ff, 0xffd24a, 0x4ad88a, 0xff8a3a, 0x9a4ad8];
    for (let k = 0; k < 9; k++) {
      const ux = 204 + rng.range(0, 18);
      const uz = -130 + k * 32 + rng.range(-6, 6);
      cyl(0.08, 0.08, 2.6, ux, 1.3, uz, stdMat(0xe8e0d0), G, 6);
      const canopy = new THREE.Mesh(unitCone, stdMat(umbColors[k % umbColors.length], { roughness: 0.7 }));
      canopy.scale.set(4.4, 1.2, 4.4);
      canopy.position.set(ux, 3.0, uz);
      canopy.rotation.y = rng.next() * Math.PI;
      canopy.castShadow = true;
      G.add(canopy);
    }
  }

  // --- Palms: neat rows along the boulevard and the beach ------------------
  function makePalm(x, z, s) {
    const g = new THREE.Group();
    const trunk = cyl(0.22 * s, 0.34 * s, 7 * s, 0, 3.5 * s, 0, stdMat(0x8a6f4d, { roughness: 1 }), g, 7);
    trunk.rotation.z = (rng.next() - 0.5) * 0.08;
    // One merged crown: five fronds as a single mesh, so sway is cheap.
    const frondGeo = new THREE.ConeGeometry(0.5, 1, 4);
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      parts.push({
        geo: frondGeo,
        matrix: mat4(Math.cos(a) * 1.1 * s, 0.4 * s, Math.sin(a) * 1.1 * s, 0, -a, Math.PI / 2.6, 2.6 * s, 0.9 * s, 0.5 * s),
      });
    }
    const crown = new THREE.Mesh(mergeGeoms(parts), stdMat(0x3f8f4f, { roughness: 0.9 }));
    crown.position.set(0, 7 * s, 0);
    crown.castShadow = true;
    g.add(crown);
    g.position.set(x, 0, z);
    G.add(g);
    city.palms.push({ crown, phase: rng.next() * 6.28, baseRot: crown.rotation.z });
    addCollider(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
  }
  // Boulevard row: palms every 20 m on both sidewalks.
  for (let z = -140; z <= 200; z += 20) {
    makePalm(192, z, 1);
    if (z % 40 === 0) makePalm(208, z + 10, 0.9);
  }
  // Beach palms in a loose line, and three on the island.
  for (let z = -100; z <= 160; z += 32) makePalm(214 + rng.range(-2, 2), z, 0.9 + rng.next() * 0.3);
  makePalm(316, -10, 1);
  makePalm(326, 8, 0.9);
  makePalm(314, 6, 1);

  // --- Clouds: merged white puffs drifting across the sky ------------------
  for (let i = 0; i < 8; i++) {
    const parts = [];
    const puffs = 3 + Math.floor(rng.next() * 3);
    for (let k = 0; k < puffs; k++) {
      parts.push({
        geo: unitSphere,
        matrix: mat4((k - puffs / 2) * 4, rng.range(-1, 1), rng.range(-1.5, 1.5), 0, 0, 0, 7 + rng.next() * 4, 2.4 + rng.next(), 4 + rng.next() * 2),
      });
    }
    const cloud = new THREE.Mesh(
      mergeGeoms(parts),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 }),
    );
    cloud.position.set(rng.range(-220, 300), 55 + rng.next() * 25, rng.range(-220, 240));
    G.add(cloud);
    city.clouds.push({ mesh: cloud, speed: 1.2 + rng.next() * 1.4 });
  }

  // --- Flyover plane (moved by daynight) ------------------------------------
  {
    const p = new THREE.Group();
    const body = cyl(0.8, 0.8, 9, 0, 0, 0, stdMat(0xe8e8e8, { metalness: 0.4, roughness: 0.4 }), p, 8);
    body.rotation.x = Math.PI / 2;
    box(1.2, 0.25, 7, 0, 0, 0, stdMat(0x3a6a8a, { metalness: 0.4 }), p);
    box(6, 0.2, 1.6, 0, 0.3, 1, stdMat(0xcccccc, { metalness: 0.4 }), p);
    p.position.set(-250, 80, -120);
    G.add(p);
    city.plane = { group: p, t: 0 };
  }

  // --- Street furniture, aligned to the grid --------------------------------
  const poleMat = stdMat(0x3c4147, { metalness: 0.6, roughness: 0.5 });
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xffd98a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  function streetlight(x, z) {
    cyl(0.14, 0.18, 6.5, x, 3.25, z, poleMat, G, 6);
    const arm = box(2.2, 0.16, 0.16, x + 1, 6.4, z, poleMat, G);
    arm.rotation.z = 0;
    box(0.9, 0.25, 0.4, x + 2, 6.3, z, stdMat(0x222222), G);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(4.5, 16), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x + 2, 0.06, z);
    G.add(pool);
    city.streetPools.push(poolMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(signGlowCanvas(0xffd98a)),
      color: 0xffd98a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(4, 4, 1);
    glow.position.set(x + 2, 6.2, z);
    G.add(glow);
    city.neons.push({ mat: null, glowMat: glow.material, base: 0.4, phase: 0, flicker: false });
  }
  // One light per intersection corner, on alternating sides, along the
  // three main avenues — neat, never random.
  for (const rx of [-80, 0, 120]) {
    for (let z = -160; z <= 200; z += 40) streetlight(rx + 6.5, z);
  }
  for (const rz of [-80, 40, 120]) {
    for (let x = -160; x <= 160; x += 40) streetlight(x, rz + 6.5);
  }

  // Bus stops at four intersections: shelter, bench, sign.
  function busStop(x, z) {
    box(4, 0.25, 1.6, x, 2.6, z, stdMat(0x2e4a6b), G);
    box(0.18, 2.6, 0.18, x - 1.8, 1.3, z - 0.7, poleMat, G);
    box(0.18, 2.6, 0.18, x + 1.8, 1.3, z - 0.7, poleMat, G);
    box(3.6, 0.5, 0.6, x, 0.7, z - 0.5, stdMat(0x8a6f5c), G);
    const sign = box(0.15, 0.9, 0.9, x + 2.4, 3.2, z, new THREE.MeshBasicMaterial({ map: signTexture('BUS', '#ffffff', '#2e4a6b') }), G);
    sign.rotation.y = Math.PI / 2;
  }
  busStop(-74, -34);
  busStop(46, -34);
  busStop(126, 46);
  busStop(-34, 126);

  // Kiosks on the beach corners.
  function kiosk(x, z) {
    box(3, 2.6, 2.4, x, 1.3, z, stdMat(0xf2e6c8), G);
    box(3.6, 0.3, 3, x, 2.8, z, stdMat(0xff2e88), G);
    box(3.2, 0.9, 0.4, x, 1.1, z + 1.3, stdMat(0x8a6f5c), G);
    addCollider(x - 1.6, z - 1.3, x + 1.6, z + 1.3);
  }
  kiosk(202, -100);
  kiosk(202, 100);

  // Benches + hydrants, aligned along the boulevard sidewalk.
  for (let z = -120; z <= 180; z += 60) {
    box(2.2, 0.45, 0.6, 192, 0.55, z, stdMat(0x8a6f5c), G);
    cyl(0.3, 0.35, 0.9, 188, 0.45, z + 14, stdMat(0xc23a2e), G, 8);
  }

  // Big billboards at the three district entrances.
  function billboard(x, z, ry, lines, bg, fg) {
    const tex = billboardTexture(lines, bg, fg);
    const panel = box(0.5, 4, 9, x, 8, z, new THREE.MeshBasicMaterial({ map: tex }), G);
    panel.rotation.y = ry;
    box(0.5, 6, 0.5, x - 3, 3, z, poleMat, G);
    box(0.5, 6, 0.5, x + 3, 3, z, poleMat, G);
    addCollider(x - 0.6, z - 4.6, x + 0.6, z + 4.6);
  }
  billboard(150, -130, Math.PI / 2, ['SUNPORT', 'NEON STRIP'], '#14181f', '#ff2e88');
  billboard(-150, 130, 0, ['SOLMAR', 'BEACH'], '#0a3a4a', '#19e3ff');
  billboard(120, 170, Math.PI / 2, ['RUSTPORT', 'DOCKS'], '#2a2118', '#ffd24a');

  // --- Parked cars (neat bays along the roads) ------------------------------
  const parkedSpots = [
    { x: 176, z: 44, yaw: -Math.PI / 2, type: 'convertible' },
    { x: 176, z: 76, yaw: Math.PI / 2, type: 'sedan' },
    { x: 176, z: -44, yaw: -Math.PI / 2, type: 'muscle' },
    { x: 176, z: -76, yaw: -Math.PI / 2, type: 'sport' },
    { x: 176, z: 116, yaw: Math.PI / 2, type: 'taxi' },
    { x: 44, z: -44, yaw: 0, type: 'pickup' },
    { x: -44, z: 44, yaw: Math.PI, type: 'sedan' },
    { x: 164, z: 148, yaw: 0, type: 'convertible' },
    { x: 124, z: 164, yaw: Math.PI / 2, type: 'muscle' },
    { x: -116, z: -44, yaw: -Math.PI / 2, type: 'sport' },
  ];
  for (const s of parkedSpots) city.parkedSpots.push({ ...s });

  return city;
}

// Circle (x, z, r) pushed out of every building AABB. Returns the
// corrected position; used by the player, cars and police.
export function collideCircle(x, z, r, colliders) {
  let px = x;
  let pz = z;
  for (const c of colliders) {
    const nx = clamp(px, c.x0, c.x1);
    const nz = clamp(pz, c.z0, c.z1);
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        px = nx + (dx / d) * r;
        pz = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = px - c.x0;
        const pr = c.x1 - px;
        const pt = pz - c.z0;
        const pb = c.z1 - pz;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) px = c.x0 - r;
        else if (m === pr) px = c.x1 + r;
        else if (m === pt) pz = c.z0 - r;
        else pz = c.z1 + r;
      }
    }
  }
  return { x: px, z: pz };
}

export function clampToWorld(x, z) {
  return {
    x: clamp(x, WORLD.minX + 4, WORLD.maxX - 4),
    z: clamp(z, WORLD.minZ + 4, WORLD.maxZ - 4),
  };
}

// Keep a walker/driver on land: the sea blocks movement past the
// shoreline, except on the bridge deck (|z| < 7) out to Cayo Verde island.
export function clampToLand(x, z) {
  let nx = x;
  let nz = z;
  const onBridge = Math.abs(nz - WORLD.bridgeZ) < 7 && nx > WORLD.seaX;
  if (nx > WORLD.seaX + 8 && !onBridge) nx = WORLD.seaX + 8;
  if (nx > 334) nx = 334;
  if (nx < WORLD.minX + 4) nx = WORLD.minX + 4;
  if (nz < WORLD.minZ + 4) nz = WORLD.minZ + 4;
  if (nz > WORLD.maxZ - 4) nz = WORLD.maxZ - 4;
  return { x: nx, z: nz };
}
