// SUNPORT v3 — pedestrians: walking, varied, faced. Every person is built
// from the same makePersonFigure helper (the player uses it too): a head
// with a real face (eyes, 3D nose, mouth on a canvas texture), hair or a
// hat, and limbs that swing while walking. Written fresh.
import * as THREE from 'three';
import { NS_ROADS, EW_ROADS, ROAD_W } from './config.js';
import { makeRng } from './rng.js';

const SKINS = [0xe8b98a, 0xc98d64, 0x8a5a3b, 0xf0c8a0, 0x6b4226];
const SHIRTS = [0xff2e88, 0x19e3ff, 0xffe14d, 0x7ddc8a, 0xff7a4d, 0xffffff, 0x9b59b6, 0x2ecc71];
const PANTS = [0x2c3e50, 0x5a4a3a, 0x1a1a2e, 0x6b7a8f, 0x3a3a3a];
const HAIRS = [0x1a1a1a, 0x4a2f1a, 0x8a6a2f, 0xaaaaaa, 0x6a1a1a];

const faceCache = new Map();

function faceTexture(variant, skinHex) {
  const key = `${variant}-${skinHex}`;
  if (faceCache.has(key)) return faceCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d');
  const skin = '#' + skinHex.toString(16).padStart(6, '0');
  g.fillStyle = skin;
  g.fillRect(0, 0, 128, 128);
  // Soft cheek shading.
  g.fillStyle = 'rgba(0,0,0,0.06)';
  g.fillRect(0, 96, 128, 32);
  const eyeY = 52;
  const eyeDX = 26;
  const drawEye = (x, open) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(x, eyeY, 11, open ? 9 : 3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a1a1a';
    g.beginPath();
    g.arc(x, eyeY + (open ? 1 : 0), 4.5, 0, Math.PI * 2);
    g.fill();
  };
  const drawBrow = (x) => {
    g.strokeStyle = '#222222';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x - 11, eyeY - 17);
    g.lineTo(x + 11, eyeY - 19);
    g.stroke();
  };
  switch (variant) {
    case 0: // friendly smile
      drawEye(64 - eyeDX, true); drawEye(64 + eyeDX, true);
      drawBrow(64 - eyeDX); drawBrow(64 + eyeDX);
      break;
    case 1: // calm, straight mouth
      drawEye(64 - eyeDX, true); drawEye(64 + eyeDX, true);
      drawBrow(64 - eyeDX); drawBrow(64 + eyeDX);
      break;
    case 2: // big open smile
      drawEye(64 - eyeDX, true); drawEye(64 + eyeDX, true);
      drawBrow(64 - eyeDX); drawBrow(64 + eyeDX);
      break;
    case 3: // glasses
      drawEye(64 - eyeDX, true); drawEye(64 + eyeDX, true);
      g.strokeStyle = '#111111';
      g.lineWidth = 4;
      for (const x of [64 - eyeDX, 64 + eyeDX]) {
        g.strokeRect(x - 14, eyeY - 12, 28, 24);
      }
      g.beginPath(); g.moveTo(64 - 12, eyeY); g.lineTo(64 + 12, eyeY); g.stroke();
      break;
    case 4: // moustache
      drawEye(64 - eyeDX, true); drawEye(64 + eyeDX, true);
      drawBrow(64 - eyeDX); drawBrow(64 + eyeDX);
      g.fillStyle = '#2a1a0a';
      g.beginPath(); g.ellipse(64, 84, 16, 5, 0, 0, Math.PI * 2); g.fill();
      break;
    case 5: // wide-eyed
      drawEye(64 - eyeDX, true); drawEye(64 + eyeDX, true);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(64 - eyeDX - 5, eyeY - 5, 2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(64 + eyeDX - 5, eyeY - 5, 2, 0, Math.PI * 2); g.fill();
      break;
    case 6: // sunglasses
      g.fillStyle = '#0a0a0a';
      for (const x of [64 - eyeDX, 64 + eyeDX]) {
        g.beginPath(); g.ellipse(x, eyeY, 13, 9, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillRect(64 - 13, eyeY - 3, 26, 4);
      break;
    case 7: // freckles + smile
      drawEye(64 - eyeDX, true); drawEye(64 + eyeDX, true);
      g.fillStyle = 'rgba(120,70,30,0.8)';
      for (const [fx, fy] of [[44, 74], [52, 78], [84, 74], [76, 78], [60, 80], [68, 80]]) {
        g.beginPath(); g.arc(fx, fy, 1.8, 0, Math.PI * 2); g.fill();
      }
      break;
    default: // serious, thick brows
      drawEye(64 - eyeDX, false); drawEye(64 + eyeDX, false);
      g.strokeStyle = '#111111';
      g.lineWidth = 6;
      for (const x of [64 - eyeDX, 64 + eyeDX]) {
        g.beginPath(); g.moveTo(x - 12, eyeY - 14); g.lineTo(x + 12, eyeY - 20); g.stroke();
      }
  }
  // Mouth (variants 2 and 7 smile wide, 1 and 4 straight, others a smile).
  g.strokeStyle = '#7a2a1a';
  g.fillStyle = '#7a2a1a';
  g.lineWidth = 4;
  if (variant === 2 || variant === 7) {
    g.beginPath(); g.arc(64, 92, 14, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.fillStyle = '#8a2a1a';
    g.beginPath(); g.ellipse(64, 100, 9, 5, 0, 0, Math.PI * 2); g.fill();
  } else if (variant === 1 || variant === 4) {
    g.beginPath(); g.moveTo(52, 102); g.lineTo(76, 102); g.stroke();
  } else if (variant === 0 || variant === 3 || variant === 5) {
    g.beginPath(); g.arc(64, 96, 11, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  } else {
    g.beginPath(); g.moveTo(54, 102); g.lineTo(74, 100); g.stroke();
  }
  // Nose shading on the texture (the 3D nose sits on top of it).
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(61, 62, 6, 16);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(key, tex);
  return tex;
}

// Build one person. Returns { group, head, armL, armR, legL, legR, torso }.
// The head is a Group: a 6-material box (face texture on +z, index 4),
// a 3D nose at z=0.18, hair or a hat, and optional glasses.
export function makePersonFigure(opts = {}) {
  const rng = opts.rng || makeRng(1);
  const skin = opts.skin ?? rng.pick(SKINS);
  const shirt = opts.shirt ?? rng.pick(SHIRTS);
  const pants = opts.pants ?? rng.pick(PANTS);
  const hairColor = opts.hairColor ?? rng.pick(HAIRS);
  const variant = opts.faceVariant ?? rng.int(0, 8);
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.75 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const group = new THREE.Group();

  const legGeo = new THREE.BoxGeometry(0.17, 0.85, 0.19);
  const legL = new THREE.Group();
  legL.position.set(-0.12, 0.88, 0);
  const legLMesh = new THREE.Mesh(legGeo, pantsMat);
  legLMesh.position.y = -0.42;
  legLMesh.castShadow = true;
  legL.add(legLMesh);
  group.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.12, 0.88, 0);
  const legRMesh = new THREE.Mesh(legGeo, pantsMat);
  legRMesh.position.y = -0.42;
  legRMesh.castShadow = true;
  legR.add(legRMesh);
  group.add(legR);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.3), shirtMat);
  torso.position.y = 1.2;
  torso.castShadow = true;
  group.add(torso);

  const armGeo = new THREE.BoxGeometry(0.15, 0.68, 0.17);
  const armL = new THREE.Group();
  armL.position.set(-0.35, 1.46, 0);
  const armLMesh = new THREE.Mesh(armGeo, shirtMat);
  armLMesh.position.y = -0.3;
  armLMesh.castShadow = true;
  armL.add(armLMesh);
  group.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.35, 1.46, 0);
  const armRMesh = new THREE.Mesh(armGeo, shirtMat);
  armRMesh.position.y = -0.3;
  armRMesh.castShadow = true;
  armR.add(armRMesh);
  group.add(armR);

  // Head: skin box + face texture + 3D nose + hair/hat.
  const head = new THREE.Group();
  head.position.y = 1.74;
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(variant, skin), roughness: 0.7 });
  const topMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.95 });
  const headBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.38, 0.34),
    [skinMat, skinMat, topMat, skinMat, faceMat, skinMat],
  );
  headBox.castShadow = true;
  head.add(headBox);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.06), skinMat);
  nose.position.set(0, -0.01, 0.18);
  head.add(nose);
  if (opts.hat === 'cap') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 10), new THREE.MeshStandardMaterial({ color: opts.hatColor ?? 0xc0392b, roughness: 0.8 }));
    cap.position.y = 0.22;
    head.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.16), cap.material);
    brim.position.set(0, 0.18, 0.22);
    head.add(brim);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.36), topMat);
    hair.position.y = 0.22;
    head.add(hair);
    if (opts.hairLong) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.08), topMat);
      back.position.set(0, 0.05, -0.18);
      head.add(back);
    }
  }
  if (opts.glasses) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.4 });
    for (const sx of [-0.085, 0.085]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 12), frameMat);
      lens.position.set(sx, 0.04, 0.18);
      head.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.015), frameMat);
    bridge.position.set(0, 0.04, 0.18);
    head.add(bridge);
  }
  group.add(head);
  return { group, head, armL, armR, legL, legR, torso };
}

export class Pedestrians {
  constructor(G, seed = 3) {
    this.G = G;
    this.rng = makeRng(seed);
    this.list = [];
    this.buildSidewalkWalkers();
    this.buildBeachWalkers();
  }

  reset() {
    for (const p of this.list) this.G.scene.remove(p.fig.group);
    this.list = [];
    this.rng = makeRng(3);
    this.buildSidewalkWalkers();
    this.buildBeachWalkers();
  }

  spawnPed(x, z, yaw, beach) {
    const rng = this.rng;
    const fig = makePersonFigure({
      rng,
      hat: rng.chance(0.22) ? 'cap' : undefined,
      glasses: rng.chance(0.18),
      hairLong: rng.chance(0.3),
    });
    fig.group.position.set(x, 0, z);
    fig.group.rotation.y = yaw;
    this.G.scene.add(fig.group);
    const ped = {
      x, z, yaw, fig,
      speed: beach ? rng.range(0.9, 1.6) : rng.range(1.4, 2.0),
      phase: rng.range(0, Math.PI * 2),
      beach: !!beach,
      road: null,
      line: 0,
      side: 1,
      pos: 0,
      dir: 1,
      wanderT: rng.range(2, 5),
      fleeT: 0,
      fleeX: 0,
      fleeZ: 0,
      staggerT: 0,
    };
    this.list.push(ped);
    return ped;
  }

  buildSidewalkWalkers() {
    const rng = this.rng;
    for (let i = 0; i < 36; i++) {
      const ns = rng.chance(0.5);
      const roads = ns ? NS_ROADS : EW_ROADS;
      const line = rng.pick(roads);
      const side = rng.chance(0.5) ? 1 : -1;
      const pos = rng.range(-240, 240);
      const dir = rng.chance(0.5) ? 1 : -1;
      const x = ns ? line + side * (ROAD_W / 2 + 1.5) : pos;
      const z = ns ? pos : line + side * (ROAD_W / 2 + 1.5);
      const yaw = ns ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const ped = this.spawnPed(x, z, yaw, false);
      ped.road = ns ? 'ns' : 'ew';
      ped.line = line;
      ped.side = side;
      ped.pos = pos;
      ped.dir = dir;
    }
  }

  buildBeachWalkers() {
    const rng = this.rng;
    for (let i = 0; i < 10; i++) {
      const x = rng.range(202, 230);
      const z = rng.range(-200, 200);
      const yaw = rng.range(0, Math.PI * 2);
      const ped = this.spawnPed(x, z, yaw, true);
      ped.wanderA = yaw;
    }
  }

  fleeFrom(x, z, radius = 16) {
    for (const p of this.list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.fleeT = 3;
        p.fleeX = x;
        p.fleeZ = z;
      }
    }
  }

  staggerAt(x, z, radius = 2.4) {
    let hit = null;
    let best = radius;
    for (const p of this.list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < best) {
        best = d;
        hit = p;
      }
    }
    if (hit) {
      hit.staggerT = 0.7;
      const dx = hit.x - x;
      const dz = hit.z - z;
      const d = Math.max(0.5, Math.hypot(dx, dz));
      hit.x += (dx / d) * 1.2;
      hit.z += (dz / d) * 1.2;
      hit.fleeT = 2.5;
      hit.fleeX = x;
      hit.fleeZ = z;
    }
    return hit;
  }

  update(dt, time) {
    for (const p of this.list) {
      let speed = p.speed;
      if (p.staggerT > 0) {
        p.staggerT -= dt;
        p.fig.group.rotation.x = Math.sin(p.staggerT * 18) * 0.12;
        continue;
      }
      p.fig.group.rotation.x = 0;
      if (p.fleeT > 0) {
        p.fleeT -= dt;
        speed = 4.2;
        const dx = p.x - p.fleeX;
        const dz = p.z - p.fleeZ;
        const d = Math.max(0.5, Math.hypot(dx, dz));
        p.yaw = Math.atan2(dx / d, dz / d);
      } else if (p.beach) {
        p.wanderT -= dt;
        if (p.wanderT <= 0) {
          p.wanderT = this.rng.range(2, 6);
          p.wanderA = this.rng.range(0, Math.PI * 2);
        }
        p.yaw = p.wanderA;
      } else {
        // Sidewalk walker: advance along the road, turn at the ends.
        p.pos += p.dir * speed * dt;
        if (p.pos > 245) { p.pos = 245; p.dir = -1; }
        if (p.pos < -245) { p.pos = -245; p.dir = 1; }
        // Occasionally turn onto a crossing road.
        const crossings = p.road === 'ns' ? EW_ROADS : NS_ROADS;
        for (const c of crossings) {
          if (Math.abs(p.pos - c) < 1.0 && this.rng.chance(dt * 0.12)) {
            const newPos = p.line;
            p.line = c;
            p.pos = newPos;
            p.road = p.road === 'ns' ? 'ew' : 'ns';
            p.dir = this.rng.chance(0.5) ? 1 : -1;
            break;
          }
        }
        p.yaw = p.road === 'ns' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      const mx = Math.sin(p.yaw) * speed * dt;
      const mz = Math.cos(p.yaw) * speed * dt;
      if (p.beach || p.fleeT > 0) {
        p.x += mx;
        p.z += mz;
        if (p.beach) {
          p.x = Math.max(200, Math.min(232, p.x));
          p.z = Math.max(-220, Math.min(220, p.z));
        }
      } else {
        p.x = p.road === 'ns' ? p.line + p.side * (ROAD_W / 2 + 1.5) : p.pos;
        p.z = p.road === 'ns' ? p.pos : p.line + p.side * (ROAD_W / 2 + 1.5);
      }
      p.phase += speed * dt * 2.4;
      const swing = p.fleeT > 0 ? 0.8 : 0.5;
      const s = Math.sin(p.phase);
      p.fig.legL.rotation.x = s * swing;
      p.fig.legR.rotation.x = -s * swing;
      p.fig.armL.rotation.x = -s * swing * 0.85;
      p.fig.armR.rotation.x = s * swing * 0.85;
      p.fig.group.position.set(p.x, 0, p.z);
      p.fig.group.rotation.y = p.yaw;
    }
  }
}
