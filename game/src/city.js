// SUNPORT v3 — the city itself: ground, roads, beach, sea, causeway, island,
// buildings per district (with real 3D detail, not flat boxes), palms,
// clouds, streetlights, marina, gate arch and monument. Written fresh.
import * as THREE from 'three';
import { WORLD, NS_ROADS, EW_ROADS, ROAD_W, PALETTE } from './config.js';
import { makeRng } from './rng.js';

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A building face: wall colour + a grid of windows. Returns both the
// diffuse map and a black emissive map that only lights some windows,
// so windows glow at night without the whole wall glowing.
function makeFacade(base, floors, cols, litRatio, rng) {
  const W = 128;
  const H = 192;
  const lit = [];
  const map = canvasTexture(W, H, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    // Subtle vertical grime / panel lines.
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 5; i++) g.fillRect((i * W) / 5, 0, 2, H);
    const cw = W / cols;
    const ch = H / floors;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.22;
        const y = f * ch + ch * 0.25;
        const w = cw * 0.56;
        const h = ch * 0.5;
        const isLit = rng.next() < litRatio;
        if (isLit) lit.push({ x, y, w, h });
        g.fillStyle = isLit ? '#ffd98a' : '#1d2b3a';
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(x, y, w, 2);
      }
    }
  });
  const emissiveMap = canvasTexture(W, H, (g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffcf7a';
    for (const win of lit) g.fillRect(win.x, win.y, win.w, win.h);
  });
  return { map, emissiveMap };
}

export class City {
  constructor(G, seed = 1) {
    this.G = G;
    this.rng = makeRng(seed);
    this.colliders = [];
    this.clouds = [];
    this.palms = [];
    this.windowMats = [];
    this.neonMats = [];
    this.glowSprites = [];
    this.boats = [];
    this.group = new THREE.Group();
    G.scene.add(this.group);
    this.buildGround();
    this.buildRoads();
    this.buildBeachAndSea();
    this.buildCausewayAndIsland();
    this.buildBuildings();
    this.buildPalms();
    this.buildStreetProps();
    this.buildClouds();
    this.buildMarina();
  }

  addCollider(x0, z0, x1, z1) {
    this.colliders.push({ x0, z0, x1, z1 });
  }

  // Is this ground point free of buildings? (Water and beach are free.)
  isFree(x, z) {
    for (const c of this.colliders) {
      if (x > c.x0 - 0.4 && x < c.x1 + 0.4 && z > c.z0 - 0.4 && z < c.z1 + 0.4) return false;
    }
    return true;
  }

  // Push a circle (x, z, radius) out of every building collider, then keep
  // it inside the playable area (and out of the open sea, except on the
  // causeway strip and the island).
  resolveCircle(x, z, r) {
    for (const c of this.colliders) {
      const cx = Math.max(c.x0, Math.min(x, c.x1));
      const cz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // Dead centre: push out along the smallest penetration axis.
          const pl = x - c.x0 + r;
          const pr = c.x1 - x + r;
          const pt = z - c.z0 + r;
          const pb = c.z1 - z + r;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.x0 - r;
          else if (m === pr) x = c.x1 + r;
          else if (m === pt) z = c.z0 - r;
          else z = c.z1 + r;
        }
      }
    }
    // Open-sea blocker (causeway strip + island are exempt).
    const onCauseway = Math.abs(z - WORLD.causewayZ) < 7 && x > WORLD.beachX;
    const dIsland = Math.hypot(x - WORLD.island.x, z - WORLD.island.z);
    const onIsland = dIsland < WORLD.island.r - 2;
    if (x > WORLD.seaX - 4 && !onCauseway && !onIsland) x = WORLD.seaX - 4;
    if (onIsland && dIsland > WORLD.island.r - 3) {
      const k = (WORLD.island.r - 3) / dIsland;
      x = WORLD.island.x + (x - WORLD.island.x) * k;
      z = WORLD.island.z + (z - WORLD.island.z) * k;
    }
    x = Math.max(-WORLD.half, Math.min(348, x));
    z = Math.max(-WORLD.half - 2, Math.min(WORLD.half, z));
    return { x, z };
  }

  districtAt(x, z) {
    const dIsland = Math.hypot(x - WORLD.island.x, z - WORLD.island.z);
    if (dIsland < WORLD.island.r) return 'Cayo Verde';
    if (x >= WORLD.beachX) return 'Solmar Beach';
    if (x >= 140) return 'Palmera Boulevard';
    if (x >= -40 && x <= 90 && z >= -40 && z <= 90) return 'Neon Strip';
    if (x >= -160 && x <= 0 && z >= -160 && z <= -20) return 'Downtown';
    if (x >= -200 && x <= -60 && z >= 60 && z <= 200) return 'Rustport';
    return 'Sunport';
  }

  buildGround() {
    const g = this.G;
    // Base ground: big slab, mostly concrete with a faint grid.
    const groundTex = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#7d8a6a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      for (let i = 0; i < 32; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 14 + Math.random() * 40);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath(); ctx.moveTo((i * w) / 8, 0); ctx.lineTo((i * w) / 8, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, (i * h) / 8); ctx.lineTo(w, (i * h) / 8); ctx.stroke();
      }
    });
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(6, 6);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 560),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(35, 0, 0);
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  buildRoads() {
    const roadTex = canvasTexture(128, 512, (ctx, w, h) => {
      ctx.fillStyle = '#2e2e33';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      // Centre dashes.
      ctx.fillStyle = '#e8c33a';
      for (let y = 0; y < h; y += 64) ctx.fillRect(w / 2 - 2, y + 8, 4, 32);
      // Edge lines.
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(4, 0, 2, h);
      ctx.fillRect(w - 6, 0, 2, h);
    });
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, metalness: 0.05 });
    const walkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 0.95 });
    const L = 560;
    for (const x of NS_ROADS) {
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, L / 64);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, L), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, 0);
      m.receiveShadow = true;
      this.group.add(m);
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, L), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(x + side * (ROAD_W / 2 + 1.5), 0.04, 0);
        walk.receiveShadow = true;
        this.group.add(walk);
      }
    }
    for (const z of EW_ROADS) {
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, L / 64);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(L, ROAD_W), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.PI / 2;
      m.position.set(0, 0.035, z);
      m.receiveShadow = true;
      this.group.add(m);
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, L), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = Math.PI / 2;
        walk.position.set(0, 0.05, z + side * (ROAD_W / 2 + 1.5));
        walk.receiveShadow = true;
        this.group.add(walk);
      }
    }
  }

  buildBeachAndSea() {
    // Sand strip along the east edge.
    const sandTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#e8d8a8';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(180,150,90,0.35)';
      for (let i = 0; i < 300; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    });
    sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
    sandTex.repeat.set(2, 8);
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(66, 560),
      new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(WORLD.beachX + 32, 0.015, 0);
    sand.receiveShadow = true;
    this.group.add(sand);
    // Open water with an animated wave texture.
    this.waterTex = canvasTexture(256, 256, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#19b8c4');
      grad.addColorStop(1, '#0a6f7d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        const y = (i * h) / 14 + 8;
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.12 + i) * 4);
        ctx.stroke();
      }
    });
    this.waterTex.wrapS = this.waterTex.wrapT = THREE.RepeatWrapping;
    this.waterTex.repeat.set(3, 5);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 640),
      new THREE.MeshStandardMaterial({ map: this.waterTex, roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.94 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(WORLD.seaX + 96, -0.5, 0);
    this.group.add(water);
    // Foam line where the waves meet the sand.
    this.foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(3, 560), this.foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(WORLD.seaX - 1, 0.06, 0);
    this.group.add(foam);
    // Lifeguard tower + beach umbrellas.
    this.buildLifeguardTower(224, 40);
    const rng = this.rng;
    for (let i = 0; i < 12; i++) {
      const x = 206 + rng.range(0, 22);
      const z = -180 + rng.range(0, 360);
      if (Math.abs(z - 40) < 12) continue;
      this.buildUmbrella(x, z, rng.pick([0xff2e88, 0x19e3ff, 0xffe14d, 0xff7a4d]));
    }
  }

  buildLifeguardTower(x, z) {
    const g = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.4, 0.22), legMat);
      leg.position.set(dx, 1.7, dz);
      g.add(leg);
    }
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2, 3),
      new THREE.MeshStandardMaterial({ color: 0xffd23e, roughness: 0.7 }),
    );
    cabin.position.y = 4.2;
    cabin.castShadow = true;
    g.add(cabin);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 1.1, 4),
      new THREE.MeshStandardMaterial({ color: 0xff2e4d, roughness: 0.7 }),
    );
    roof.position.y = 5.8;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.position.set(x, 0, z);
    this.group.add(g);
    this.addCollider(x - 1.4, z - 1.4, x + 1.4, z + 1.4);
  }

  buildUmbrella(x, z, color) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 }),
    );
    pole.position.y = 1.2;
    g.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 0.8, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide }),
    );
    top.position.y = 2.6;
    top.castShadow = true;
    g.add(top);
    g.position.set(x, 0, z);
    this.group.add(g);
  }

  buildCausewayAndIsland() {
    // Low causeway (flat, y=0 — cars drive on it at street level).
    const roadMat = new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.9 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(108, 0.5, 10), roadMat);
    deck.position.set(250, -0.1, WORLD.causewayZ);
    deck.receiveShadow = true;
    this.group.add(deck);
    const railMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.6, metalness: 0.4 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(108, 0.9, 0.25), railMat);
      rail.position.set(250, 0.6, WORLD.causewayZ + side * 5);
      this.group.add(rail);
    }
    // Cayo Verde island: sand disc + lighthouse + two cottages.
    const sand = new THREE.Mesh(
      new THREE.CircleGeometry(WORLD.island.r, 28),
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(WORLD.island.x, 0.15, WORLD.island.z);
    sand.receiveShadow = true;
    this.group.add(sand);
    // Lighthouse (striped tower + lamp room + glow).
    const lh = new THREE.Group();
    const stripeTex = canvasTexture(64, 128, (ctx, w, h) => {
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#c0392b' : '#ffffff';
        ctx.fillRect(0, (i * h) / 6, w, h / 6);
      }
    });
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 3, 18, 12),
      new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.7 }),
    );
    tower.position.y = 9;
    tower.castShadow = true;
    lh.add(tower);
    const lampRoom = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 2.4, 10),
      new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.4, metalness: 0.5 }),
    );
    lampRoom.position.y = 19;
    lh.add(lampRoom);
    const lampGlow = this.makeGlowSprite(0xfff2b0, 16);
    lampGlow.position.y = 19;
    lh.add(lampGlow);
    this.glowSprites.push(lampGlow);
    lh.position.set(WORLD.island.x + 14, 0.15, WORLD.island.z - 10);
    this.group.add(lh);
    this.addCollider(WORLD.island.x + 11, WORLD.island.z - 13, WORLD.island.x + 17, WORLD.island.z - 7);
    for (const [dx, dz] of [[-16, 12], [8, 16]]) {
      const cottage = new THREE.Mesh(
        new THREE.BoxGeometry(9, 5, 8),
        new THREE.MeshStandardMaterial({ color: 0xfdfd96, roughness: 0.85 }),
      );
      cottage.position.set(WORLD.island.x + dx, 2.6, WORLD.island.z + dz);
      cottage.castShadow = true;
      this.group.add(cottage);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(6.5, 2.6, 4),
        new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }),
      );
      roof.position.set(WORLD.island.x + dx, 6.4, WORLD.island.z + dz);
      roof.rotation.y = Math.PI / 4;
      this.group.add(roof);
    }
  }

  makeGlowSprite(color, size) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false }),
    );
    spr.scale.setScalar(size);
    return spr;
  }

  buildBuildings() {
    const rng = this.rng;
    // Facade variants shared by every building (diffuse + lit-window map).
    this.facades = [];
    const bases = ['#ffb3c6', '#a8e6cf', '#ffd3a5', '#a5d8ff', '#f4ead5', '#c3aed6'];
    for (let i = 0; i < 6; i++) {
      const floors = 4 + (i % 3) * 2;
      const cols = 3 + (i % 3);
      this.facades.push(makeFacade(bases[i], floors, cols, 0.35, rng));
    }
    this.glassFacade = makeFacade('#9fc6e8', 8, 5, 0.45, rng);
    // Blocks between roads.
    const xs = [-260, ...NS_ROADS, 260];
    const zs = [-260, ...EW_ROADS, 260];
    for (let bi = 0; bi < xs.length - 1; bi++) {
      for (let bj = 0; bj < zs.length - 1; bj++) {
        const x0 = xs[bi] + ROAD_W / 2 + 3;
        const x1 = xs[bi + 1] - ROAD_W / 2 - 3;
        const z0 = zs[bj] + ROAD_W / 2 + 3;
        const z1 = zs[bj + 1] - ROAD_W / 2 - 3;
        if (x1 - x0 < 14 || z1 - z0 < 14) continue;
        if (x0 >= WORLD.beachX - 2) continue; // sand, not blocks
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const district = this.districtAt(cx, cz);
        // Central park: keep (-100,-100) clear for the stand-down point.
        if (cx > -128 && cx < -64 && cz > -128 && cz < -64) {
          this.buildPark(cx, cz);
          continue;
        }
        // Mission garage forecourt: keep (168,160) clear.
        if (cx > 128 && cx < 176 && cz > 128 && cz < 192) {
          this.buildGarage(158, 170);
          continue;
        }
        this.buildBlock(x0, z0, x1, z1, district);
      }
    }
  }

  buildPark(cx, cz) {
    const rng = this.rng;
    for (let i = 0; i < 7; i++) {
      const x = cx + rng.range(-22, 22);
      const z = cz + rng.range(-22, 22);
      if (Math.hypot(x + 100, z + 100) < 8) continue;
      this.buildPalmAt(x, z);
    }
    // Monument obelisk, offset from the stand-down point.
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.6 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 4), mat);
    base.position.set(-108, 0.6, -108);
    this.group.add(base);
    const ob = new THREE.Mesh(new THREE.BoxGeometry(1.6, 11, 1.6), mat);
    ob.position.set(-108, 6.7, -108);
    ob.castShadow = true;
    this.group.add(ob);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.8, 4), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.7, roughness: 0.3 }));
    tip.position.set(-108, 13.1, -108);
    tip.rotation.y = Math.PI / 4;
    this.group.add(tip);
    this.addCollider(-110, -110, -106, -106);
  }

  buildGarage(x, z) {
    // Low garage block; the mission target (168,160) stays on open forecourt.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(14, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a94a6, roughness: 0.85 }),
    );
    body.position.set(x, 3, z);
    body.castShadow = true;
    this.group.add(body);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(9, 4.4, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.6, metalness: 0.4 }),
    );
    door.position.set(x + 3, 2.2, z - 5.1);
    this.group.add(door);
    const sign = this.makeSignTexture('MAMA DELIA', '#ffe14d', '#222831');
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 1.6),
      new THREE.MeshBasicMaterial({ map: sign, transparent: true }),
    );
    signMesh.position.set(x, 6.6, z - 5.2);
    this.group.add(signMesh);
    this.addCollider(x - 7, z - 5, x + 7, z + 5);
  }

  makeSignTexture(text, fg, bg) {
    return canvasTexture(256, 48, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = fg;
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 1);
    });
  }

  buildBlock(x0, z0, x1, z1, district) {
    const rng = this.rng;
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    if (district === 'Downtown') {
      const bw = Math.min(26, w - 8);
      const bd = Math.min(26, d - 8);
      const h = rng.range(34, 82);
      this.buildTower(cx, cz, bw, h, bd, true);
      return;
    }
    if (district === 'Rustport') {
      const bw = Math.min(34, w - 6);
      const bd = Math.min(24, d - 6);
      this.buildWarehouse(cx, cz, bw, rng.range(8, 13), bd);
      if (rng.chance(0.6)) this.buildWaterTower(cx + bw / 2 - 6, cz + bd / 2 - 6);
      return;
    }
    const count = district === 'Palmera Boulevard' ? 2 : rng.int(2, 3);
    for (let i = 0; i < count; i++) {
      const bw = Math.min(20, w / count - 4);
      const bd = Math.min(20, d - 8);
      if (bw < 8 || bd < 8) continue;
      const bx = x0 + ((i + 0.5) * w) / count + rng.range(-2, 2);
      const bz = cz + rng.range(-4, 4);
      const h = district === 'Palmera Boulevard' ? rng.range(12, 30) : rng.range(7, 16);
      this.buildHouse(bx, bz, bw, h, bd, district);
    }
  }

  facadeMaterial(variant, w, h) {
    const tex = variant.map.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 9)));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const eTex = variant.emissiveMap.clone();
    eTex.needsUpdate = true;
    eTex.repeat.copy(tex.repeat);
    eTex.wrapS = eTex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: eTex,
      emissive: new THREE.Color(0xffc46b),
      emissiveIntensity: 0,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.windowMats.push(mat);
    return mat;
  }

  addRoofDetails(g, w, h, d) {
    const rng = this.rng;
    const acMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7, metalness: 0.3 });
    const n = 1 + Math.floor(rng.next() * 3);
    for (let i = 0; i < n; i++) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.2), acMat);
      ac.position.set(rng.range(-w / 2 + 2, w / 2 - 2), h + 0.45, rng.range(-d / 2 + 2, d / 2 - 2));
      g.add(ac);
    }
    // Parapet rim.
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x6b6f78, roughness: 0.9 });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3), rimMat);
    rim.position.y = h + 0.25;
    g.add(rim);
  }

  addBalconies(g, w, h, d) {
    const floors = Math.max(1, Math.floor(h / 6));
    const bMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.9 });
    for (let f = 1; f <= floors; f++) {
      const y = f * (h / (floors + 1));
      if (y > h - 2) continue;
      const balc = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.25, 1.4), bMat);
      balc.position.set(0, y, d / 2 + 0.6);
      g.add(balc);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.9, 0.12), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.5 }));
      rail.position.set(0, y + 0.55, d / 2 + 1.25);
      g.add(rail);
    }
  }

  addCanopy(g, w, d) {
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.6, 0.25, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x2e4a7a, roughness: 0.8 }),
    );
    canopy.position.set(0, 3.4, d / 2 + 1.1);
    canopy.rotation.x = 0.25;
    g.add(canopy);
  }

  addNeonSign(g, w, h, d, text, color) {
    const tex = this.makeSignTexture(text, '#ffffff', '#111111');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(11, w * 0.8), 1.8),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    sign.position.set(0, h * 0.55, d / 2 + 0.15);
    g.add(sign);
    const glow = this.makeGlowSprite(color, 9);
    glow.position.set(0, h * 0.55, d / 2 + 0.8);
    g.add(glow);
    this.glowSprites.push(glow);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.6,
      roughness: 0.4,
    });
    this.neonMats.push(mat);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(Math.min(11, w * 0.8), 0.18, 0.18), mat);
    tube.position.set(0, h * 0.55 + 1.05, d / 2 + 0.15);
    g.add(tube);
  }

  addRoofBillboard(g, w, h, d, text) {
    const tex = this.makeSignTexture(text, '#ffe14d', '#101418');
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(9, 3, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8 }),
    );
    board.position.set(0, h + 1.8, -d / 4);
    g.add(board);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 2.6),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    face.position.set(0, h + 1.8, -d / 4 + 0.25);
    g.add(face);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x666666 }));
    post.position.set(0, h + 0.4, -d / 4);
    g.add(post);
  }

  buildTower(x, z, w, h, d, glass) {
    const g = new THREE.Group();
    const variant = glass ? this.glassFacade : this.facades[this.rng.int(0, 5)];
    const mat = this.facadeMaterial(variant, w, h);
    if (glass) {
      mat.metalness = 0.55;
      mat.roughness = 0.25;
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // Stepped crown.
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 3, d * 0.55), new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.5, metalness: 0.4 }));
    crown.position.y = h + 1.5;
    g.add(crown);
    this.addRoofDetails(g, w, h, d);
    if (this.rng.chance(0.5)) this.addRoofBillboard(g, w, h, d, this.rng.pick(['SUNPORT', 'NEON', 'HOTEL', 'VISTA']));
    g.position.set(x, 0, z);
    this.group.add(g);
    this.addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }

  buildWarehouse(x, z, w, h, d) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: this.rng.pick([0x9a7b52, 0x7a8a99, 0xa88f6a]), roughness: 0.9, metalness: 0.15 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2;
    body.castShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.5, d * 0.5, w, 12, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.7, metalness: 0.3 }));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.y = h;
    roof.scale.set(1, 1, 0.35);
    g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, h * 0.7, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.6, metalness: 0.4 }));
    door.position.set(0, h * 0.35, d / 2 + 0.15);
    g.add(door);
    this.addRoofDetails(g, w, h, d);
    g.position.set(x, 0, z);
    this.group.add(g);
    this.addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }

  buildWaterTower(x, z) {
    const g = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.7, metalness: 0.4 });
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 6), legMat);
      leg.position.set(dx, 4.5, dz);
      g.add(leg);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 5, 12), new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.6, metalness: 0.3 }));
    tank.position.y = 11.5;
    tank.castShadow = true;
    g.add(tank);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x8a2f2f, roughness: 0.7 }));
    cap.position.y = 14.9;
    g.add(cap);
    g.position.set(x, 0, z);
    this.group.add(g);
    this.addCollider(x - 3.4, z - 3.4, x + 3.4, z + 3.4);
  }

  buildHouse(x, z, w, h, d, district) {
    const g = new THREE.Group();
    const variant = this.facades[this.rng.int(0, 5)];
    const mat = this.facadeMaterial(variant, w, h);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // Stepped roof slab (not a flat box).
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 1.1, d * 0.92), new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 0.9 }));
    roof.position.y = h + 0.55;
    g.add(roof);
    const roof2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 1.0, d * 0.55), new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.9 }));
    roof2.position.y = h + 1.6;
    g.add(roof2);
    this.addRoofDetails(g, w, h, d);
    if (district === 'Palmera Boulevard' && h > 10) this.addBalconies(g, w, h, d);
    if (district === 'Palmera Boulevard' || district === 'Neon Strip') this.addCanopy(g, w, d);
    if (district === 'Neon Strip') {
      this.addNeonSign(g, w, h, d, this.rng.pick(['CLUB NEON', 'BAR LUNA', 'KTV STAR', 'CASINO']), this.rng.pick([PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonYellow]));
    }
    if (district === 'Palmera Boulevard' && this.rng.chance(0.5)) {
      this.addRoofBillboard(g, w, h, d, this.rng.pick(['PALMERA', 'SUNPORT', 'BEACH']));
    }
    g.position.set(x, 0, z);
    this.group.add(g);
    this.addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }

  buildPalmAt(x, z) {
    const g = new THREE.Group();
    const lean = this.rng.range(-0.08, 0.08);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.28, 6.5, 7),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1 }),
    );
    trunk.position.y = 3.25;
    trunk.rotation.z = lean;
    trunk.castShadow = true;
    g.add(trunk);
    const fronds = new THREE.Group();
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4, 4), frondMat);
      const a = (i / 7) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.1, 6.6, Math.sin(a) * 1.1);
      frond.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      frond.scale.set(1, 1, 0.25);
      fronds.add(frond);
    }
    const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }));
    nuts.position.y = 6.3;
    fronds.add(nuts);
    g.add(fronds);
    g.position.set(x, 0, z);
    this.group.add(g);
    this.palms.push({ fronds, phase: this.rng.range(0, Math.PI * 2) });
  }

  buildPalms() {
    const rng = this.rng;
    // Palmera Boulevard rows.
    for (let z = -240; z <= 240; z += 16) {
      if (Math.abs(z - WORLD.causewayZ) < 10) continue;
      this.buildPalmAt(176 - 9.5, z + rng.range(-2, 2));
      if (rng.chance(0.7)) this.buildPalmAt(176 + 9.5, z + rng.range(-2, 2));
    }
    // Beach scatter.
    for (let i = 0; i < 16; i++) {
      this.buildPalmAt(206 + rng.range(0, 20), -220 + rng.range(0, 440));
    }
  }

  buildStreetProps() {
    const rng = this.rng;
    // Streetlights at intersections.
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 0.6 });
    for (const x of NS_ROADS) {
      for (const z of EW_ROADS) {
        if (rng.chance(0.5)) continue;
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 6), poleMat);
        pole.position.y = 3.5;
        g.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), poleMat);
        arm.position.set(1, 6.9, 0);
        g.add(arm);
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0 }),
        );
        lamp.position.set(2.1, 6.8, 0);
        g.add(lamp);
        this.windowMats.push(lamp.material);
        const glow = this.makeGlowSprite(0xffe9a8, 5);
        glow.position.set(2.1, 6.8, 0);
        g.add(glow);
        this.glowSprites.push(glow);
        g.position.set(x + ROAD_W / 2 + 2, 0, z + ROAD_W / 2 + 2);
        this.group.add(g);
      }
    }
    // Bus stops + kiosks along the boulevard.
    for (const z of [-120, -40, 60, 140]) {
      const g = new THREE.Group();
      const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, 2), new THREE.MeshStandardMaterial({ color: 0x2e4a7a, roughness: 0.8 }));
      roof.position.y = 2.6;
      g.add(roof);
      for (const dx of [-1.8, 1.8]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), poleMat);
        post.position.set(dx, 1.3, 0);
        g.add(post);
      }
      const bench = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 }));
      bench.position.y = 0.6;
      g.add(bench);
      g.position.set(176 - 9.5, 0, z);
      this.group.add(g);
    }
    // SUNPORT gate arch over the boulevard's south entrance.
    const archMat = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.7 });
    for (const dx of [-7, 7]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9, 1.4), archMat);
      pillar.position.set(176 + dx, 4.5, 196);
      pillar.castShadow = true;
      this.group.add(pillar);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(15.4, 2.2, 1.6), archMat);
    beam.position.set(176, 9.8, 196);
    beam.castShadow = true;
    this.group.add(beam);
    const gateTex = this.makeSignTexture('★ SUNPORT ★', '#ff2e88', '#f2ead8');
    const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.9), new THREE.MeshBasicMaterial({ map: gateTex, transparent: true }));
    gateSign.position.set(176, 9.8, 196 + 0.85);
    this.group.add(gateSign);
  }

  buildClouds() {
    const rng = this.rng;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.88 });
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Group();
      const puffs = 3 + Math.floor(rng.next() * 3);
      for (let p = 0; p < puffs; p++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(5, 11), 10, 8), mat);
        s.position.set(p * rng.range(6, 9) - puffs * 3, rng.range(-1.5, 1.5), rng.range(-4, 4));
        s.scale.y = 0.45;
        mesh.add(s);
      }
      mesh.position.set(rng.range(-300, 300), rng.range(90, 140), rng.range(-280, 280));
      this.group.add(mesh);
      this.clouds.push({ mesh, speed: rng.range(2.0, 3.0) });
    }
  }

  buildMarina() {
    // Wooden pier + three yachts bobbing at the south-east water edge.
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(26, 0.6, 5),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1 }),
    );
    pier.position.set(252, 0.1, 140);
    pier.castShadow = true;
    this.group.add(pier);
    for (let i = 0; i < 3; i++) {
      const y = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(9, 1.6, 3),
        new THREE.MeshStandardMaterial({ color: [0xffffff, 0xffe14d, 0x19e3ff][i], roughness: 0.35, metalness: 0.4 }),
      );
      hull.position.y = 0.4;
      y.add(hull);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 2.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
      cabin.position.set(-0.5, 1.8, 0);
      y.add(cabin);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5, metalness: 0.5 }));
      mast.position.set(1.5, 4.5, 0);
      y.add(mast);
      y.position.set(262 + i * 3, -0.2, 128 + i * 14);
      this.group.add(y);
      this.boats.push({ mesh: y, phase: i * 1.7 });
    }
  }

  update(dt, nightF, time) {
    for (const p of this.palms) {
      p.fronds.rotation.z = Math.sin(time * 0.8 + p.phase) * 0.07;
      p.fronds.rotation.x = Math.cos(time * 0.6 + p.phase) * 0.05;
    }
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 330) c.mesh.position.x = -330;
    }
    if (this.waterTex) this.waterTex.offset.x += dt * 0.02;
    if (this.foamMat) this.foamMat.opacity = 0.3 + Math.sin(time * 1.4) * 0.14;
    for (const m of this.windowMats) m.emissiveIntensity = nightF * 1.4;
    for (const m of this.neonMats) {
      m.emissiveIntensity = 1.4 + Math.sin(time * 3 + m.id * 0.7) * 0.5;
    }
    for (const s of this.glowSprites) s.material.opacity = 0.25 + nightF * 0.75;
    for (const b of this.boats) {
      b.mesh.position.y = -0.2 + Math.sin(time * 0.9 + b.phase) * 0.18;
      b.mesh.rotation.z = Math.sin(time * 0.7 + b.phase) * 0.03;
    }
  }
}
