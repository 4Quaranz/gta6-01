// SUNPORT v2 — the player avatar: Jace Moreno. A low-poly figure built
// from boxes with real limb pivots, so walking, running and punching are
// visibly animated — arms and legs swing, the body leans into a sprint,
// and a punch is a full arm swing with a torso twist, not a frozen pose.

import * as THREE from 'three';
import { SPEEDS, STAMINA, angleLerp, clamp } from './config.js';
import { collideCircle, clampToLand } from './city.js';

// ---------------------------------------------------------------------------
// Faces. Every character gets eyes, a nose and a mouth — drawn on a canvas
// texture for the front of the head, plus a small 3D nose bump. The texture
// is bright (white eyes, dark pupils, clear mouth line) so the face still
// reads at dusk and at night, and each variant looks different: Jace's
// steady look, a smile, narrow eyes, glasses, sunglasses, a mustache,
// Lena's lashes and lips, and a sleepy face. One texture per skin tone +
// variant, cached and shared by every character who wears it.
// ---------------------------------------------------------------------------

function hexCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

const faceTexCache = new Map();

function faceTexture(skinHex, variant) {
  const key = `${skinHex}|${variant}`;
  if (faceTexCache.has(key)) return faceTexCache.get(key);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = hexCss(skinHex);
  g.fillRect(0, 0, 128, 128);
  // Soft shading at the edges so the face is not flat.
  const edge = g.createRadialGradient(64, 64, 40, 64, 64, 95);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.14)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 128, 128);

  const eyeY = 50;
  const eyeDX = 26;
  const eyeW = variant === 2 ? 15 : 22;
  const eyeH = variant === 7 ? 6 : 12;
  const eyeColor = variant === 0 ? '#2a1a10' : '#1a1a1a';
  for (const sx of [-1, 1]) {
    const ex = 64 + sx * eyeDX;
    if (variant !== 4) {
      // White of the eye, then the pupil.
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(ex, eyeY, eyeW / 2, eyeH / 2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = eyeColor;
      g.beginPath();
      g.arc(ex, eyeY, 4.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(ex + 1.5, eyeY - 1.5, 1.4, 0, Math.PI * 2);
      g.fill();
    }
    // Eyebrow.
    g.strokeStyle = 'rgba(30,20,10,0.9)';
    g.lineWidth = 3.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(ex - 11, eyeY - 15);
    g.lineTo(ex + 11, eyeY - 16);
    g.stroke();
    // Lena's lashes.
    if (variant === 6) {
      g.strokeStyle = '#1a1a1a';
      g.lineWidth = 2;
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(ex + k * 6, eyeY - eyeH / 2 - 1);
        g.lineTo(ex + k * 7, eyeY - eyeH / 2 - 6);
        g.stroke();
      }
    }
  }
  // Sunglasses: one dark band across both eyes (drawn over them).
  if (variant === 4) {
    g.fillStyle = '#101418';
    g.beginPath();
    g.roundRect(28, 40, 72, 20, 8);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(34, 43, 18, 4);
    g.fillRect(76, 43, 18, 4);
  }
  // Round glasses: frames around the eyes + bridge.
  if (variant === 3) {
    g.strokeStyle = '#222831';
    g.lineWidth = 3;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.arc(64 + sx * eyeDX, eyeY, 14, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(64 - eyeDX + 14, eyeY);
    g.lineTo(64 + eyeDX - 14, eyeY);
    g.stroke();
  }
  // Nose shading under the 3D nose bump.
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(64, 78, 7, 4, 0, 0, Math.PI * 2);
  g.fill();
  // Mustache.
  if (variant === 5) {
    g.fillStyle = '#2a1a10';
    g.beginPath();
    g.ellipse(53, 90, 12, 5, -0.25, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(75, 90, 12, 5, 0.25, 0, Math.PI * 2);
    g.fill();
  }
  // Mouth.
  const mouthY = 100;
  if (variant === 6) {
    // Lena: red lips.
    g.fillStyle = '#c23a4a';
    g.beginPath();
    g.ellipse(64, mouthY, 13, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8a2430';
    g.beginPath();
    g.ellipse(64, mouthY, 10, 2, 0, 0, Math.PI * 2);
    g.fill();
  } else if (variant === 1 || variant === 5) {
    // Smile.
    g.strokeStyle = '#4a2418';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(64, mouthY - 6, 12, 0.25 * Math.PI, 0.75 * Math.PI);
    g.stroke();
  } else {
    // Straight mouth.
    const w = variant === 7 ? 12 : variant === 2 ? 16 : 20;
    g.strokeStyle = '#4a2418';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(64 - w / 2, mouthY);
    g.lineTo(64 + w / 2, mouthY);
    g.stroke();
  }
  // Jace: light stubble on the lower face.
  if (variant === 0) {
    g.fillStyle = 'rgba(0,0,0,0.07)';
    g.fillRect(24, 92, 80, 36);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  faceTexCache.set(key, tex);
  return tex;
}

// One articulated figure. The same builder is used for Jace, Lena and
// every pedestrian — only the colours and the scale change.
export function buildAvatar(opts = {}) {
  const skin = opts.skin ?? 0xc98e6a;
  const shirt = opts.shirt ?? 0x2e6a8a;
  const pants = opts.pants ?? 0x2a2f38;
  const hair = opts.hair ?? 0x1a1a1a;
  const shoes = 0x1c1c1c;
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: shoes, roughness: 0.9 });

  function part(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  }

  // Legs pivot at the hip (y = 0.95).
  const legL = new THREE.Group();
  legL.position.set(-0.14, 0.95, 0);
  legL.add(part(0.2, 0.9, 0.22, 0, -0.45, 0, pantsMat));
  legL.add(part(0.22, 0.14, 0.34, 0, -0.88, 0.05, shoeMat));
  g.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.14, 0.95, 0);
  legR.add(part(0.2, 0.9, 0.22, 0, -0.45, 0, pantsMat));
  legR.add(part(0.22, 0.14, 0.34, 0, -0.88, 0.05, shoeMat));
  g.add(legR);

  // Torso.
  const torso = new THREE.Group();
  torso.position.set(0, 0.95, 0);
  torso.add(part(0.62, 0.72, 0.34, 0, 0.36, 0, shirtMat));
  // Jacket stripe for readability at a distance.
  torso.add(part(0.64, 0.1, 0.36, 0, 0.55, 0, new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.8 })));
  g.add(torso);

  // Head + hair. The head box wears the face texture on its front (+z)
  // face, and a small 3D nose bump sits on top of it.
  const head = new THREE.Group();
  head.position.set(0, 1.78, 0);
  const faceTex = faceTexture(skin, opts.face ?? 0);
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex, roughness: 0.7,
    emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.18,
  });
  const headMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.32),
    [skinMat, skinMat, skinMat, skinMat, faceMat, skinMat],
  );
  headMesh.position.set(0, 0.12, 0);
  headMesh.castShadow = true;
  head.add(headMesh);
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.1, 0.06),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(skin).multiplyScalar(0.82), roughness: 0.7 }),
  );
  nose.position.set(0, 0.1, 0.18);
  nose.castShadow = true;
  head.add(nose);
  head.add(part(0.36, 0.12, 0.34, 0, 0.32, 0, hairMat));
  head.add(part(0.36, 0.2, 0.1, 0, 0.22, -0.12, hairMat));
  g.add(head);

  // Arms pivot at the shoulder (y = 1.68).
  const armL = new THREE.Group();
  armL.position.set(-0.4, 1.68, 0);
  armL.add(part(0.18, 0.72, 0.2, 0, -0.36, 0, shirtMat));
  armL.add(part(0.16, 0.16, 0.18, 0, -0.76, 0, skinMat));
  g.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.4, 1.68, 0);
  armR.add(part(0.18, 0.72, 0.2, 0, -0.36, 0, shirtMat));
  armR.add(part(0.16, 0.16, 0.18, 0, -0.76, 0, skinMat));
  g.add(armR);

  return { group: g, legL, legR, armL, armR, torso, head };
}

// Pose a figure's limbs for a walk/run cycle. phase advances with speed;
// amp grows when running. Call every frame for every moving figure.
export function poseWalk(figure, phase, amp, lean) {
  const s = Math.sin(phase);
  const c = Math.sin(phase + Math.PI);
  figure.legL.rotation.x = s * amp;
  figure.legR.rotation.x = c * amp;
  figure.armL.rotation.x = c * amp * 0.8;
  figure.armR.rotation.x = s * amp * 0.8;
  figure.torso.rotation.x = lean;
  figure.torso.position.y = 0.95 + Math.abs(Math.cos(phase)) * 0.04 * amp;
}

// Pose a punch: phase 0..1 across the punch. The punching arm snaps
// forward with a windup, the torso twists and leans in.
export function posePunch(figure, phase) {
  const swing = Math.sin(Math.min(1, phase * 1.4) * Math.PI * 0.5);
  const recover = phase > 0.55 ? (phase - 0.55) / 0.45 : 0;
  const ext = swing * (1 - recover * 0.7);
  figure.armR.rotation.x = -0.3 - 1.35 * ext;
  figure.armR.rotation.z = -0.15 * ext;
  figure.armL.rotation.x = 0.55 * ext;
  figure.armL.rotation.z = 0.3 * ext;
  figure.torso.rotation.x = 0.16 * ext;
  figure.torso.rotation.y = -0.28 * ext;
  figure.head.rotation.y = -0.12 * ext;
}

export class Player {
  constructor(scene) {
    this.figure = buildAvatar({ shirt: 0x2e6a8a, pants: 0x2a2f38, skin: 0xc98e6a, hair: 0x1a1a1a, face: 0 });
    this.group = this.figure.group;
    scene.add(this.group);
    this.x = 190;
    this.z = 32;
    this.yaw = -Math.PI / 2;
    this.camYaw = -Math.PI / 2;
    this.camPitch = 0.32;
    this.onFoot = true;
    this.car = null;
    this.health = 100;
    this.money = 120;
    this.weapon = 'fists';
    this.mag = 12;
    this.reserve = 24;
    this.hasPistol = false;
    this.stamina = STAMINA.max;
    this.sprinting = false;
    this.punchT = 0; // counts down from COMBAT.punchTime while punching
    this.punchDidHit = false;
    this.walkPhase = 0;
    this.speed = 0;
    this.staggerT = 0;
    this.vy = 0; // jump vertical speed
    this.jumpY = 0; // height above the ground while jumping
  }

  reset(x, z, yaw) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.camYaw = yaw;
    this.onFoot = true;
    this.car = null;
    this.health = 100;
    this.stamina = STAMINA.max;
    this.punchT = 0;
    this.vy = 0;
    this.jumpY = 0;
    this.group.visible = true;
  }

  startPunch() {
    if (this.punchT > 0 || !this.onFoot) return false;
    this.punchT = 0.45;
    this.punchDidHit = false;
    return true;
  }

  get punchPhase() {
    return this.punchT > 0 ? 1 - this.punchT / 0.45 : -1;
  }

  enterCar(car) {
    this.onFoot = false;
    this.car = car;
    this.group.visible = false;
    this.punchT = 0;
  }

  exitCar() {
    if (!this.car) return;
    const c = this.car;
    this.car = null;
    this.onFoot = true;
    this.group.visible = true;
    // Step out on the driver's side.
    this.x = c.x - Math.cos(c.yaw) * 2.2;
    this.z = c.z + Math.sin(c.yaw) * 2.2;
    this.yaw = c.yaw;
    this.vy = 0;
    this.jumpY = 0;
  }

  takeDamage(n) {
    this.health = Math.max(0, this.health - n);
    this.staggerT = 0.35;
  }

  update(dt, input, ctx) {
    // Camera orbit from mouse / touch drag — works on foot and in a car.
    const md = input.takeMouseDelta();
    if (md.x !== 0 || md.y !== 0) {
      this.camYaw += md.x * 0.0045;
      this.camPitch = clamp(this.camPitch + md.y * 0.003, 0.05, 1.1);
    }
    // In a car the avatar rides along; the car drives itself.
    if (!this.onFoot) {
      // Drain jump presses: Space is the handbrake while driving, and a
      // stale press must not turn into a jump the moment the player exits.
      input.consume('Space');
      if (this.car) { this.x = this.car.x; this.z = this.car.z; this.yaw = this.car.yaw; }
      this.group.position.set(this.x, 0, this.z);
      this.group.rotation.y = this.yaw;
      return;
    }
    // Jump: Space, edge-triggered, only from the ground. ~1.2 m high.
    if (input.consume('Space') && this.jumpY <= 0) this.vy = 7.2;
    if (this.jumpY > 0 || this.vy > 0) {
      this.vy -= 22 * dt;
      this.jumpY = Math.max(0, this.jumpY + this.vy * dt);
      if (this.jumpY === 0) this.vy = 0;
    }
    const axis = input.moveAxis(this.camYaw);
    const moving = axis.mag > 0.08;
    // Sprint: Shift or the LARI button, while there is stamina to spend.
    const wantSprint = input.sprint && (this.sprinting || this.stamina > STAMINA.minToSprint);
    this.sprinting = wantSprint && moving;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - STAMINA.drain * dt);
      if (this.stamina <= 0) this.sprinting = false;
    } else {
      this.stamina = Math.min(STAMINA.max, this.stamina + STAMINA.regen * dt);
    }
    const speed = this.sprinting ? SPEEDS.sprint : SPEEDS.walk;
    let nx = this.x;
    let nz = this.z;
    if (moving) {
      nx += axis.x * speed * axis.mag * dt;
      nz += axis.z * speed * axis.mag * dt;
      const targetYaw = Math.atan2(axis.x, axis.z);
      this.yaw = angleLerp(this.yaw, targetYaw, Math.min(1, dt * 10));
      this.speed = speed * axis.mag;
      this.walkPhase += dt * speed * 2.1 * axis.mag;
    } else {
      this.speed = 0;
      this.walkPhase += dt * 1.2;
    }
    // Collisions: buildings, then the shoreline.
    const fixed = collideCircle(nx, nz, 0.6, ctx.colliders);
    const land = clampToLand(fixed.x, fixed.z);
    this.x = land.x;
    this.z = land.z;
    // Punch timer.
    if (this.punchT > 0) this.punchT = Math.max(0, this.punchT - dt);
    if (this.staggerT > 0) this.staggerT = Math.max(0, this.staggerT - dt);
    // Pose: punch overrides the walk cycle while it runs.
    const f = this.figure;
    if (this.jumpY > 0) {
      // Airborne: tuck the legs, arms out for balance.
      f.legL.rotation.x = 0.6;
      f.legR.rotation.x = -0.4;
      f.armL.rotation.z = 0.5;
      f.armR.rotation.z = -0.5;
      f.armL.rotation.x = -0.3;
      f.armR.rotation.x = -0.3;
      f.torso.rotation.x = 0.08;
    } else if (this.punchT > 0) {
      posePunch(f, this.punchPhase);
      f.legL.rotation.x = Math.sin(this.walkPhase) * 0.25;
      f.legR.rotation.x = -Math.sin(this.walkPhase) * 0.25;
    } else if (moving) {
      const amp = this.sprinting ? 0.95 : 0.65;
      poseWalk(f, this.walkPhase, amp, this.sprinting ? 0.14 : 0.05);
    } else {
      // Idle: breathe, arms hang loose.
      const b = Math.sin(performance.now() * 0.0016) * 0.02;
      f.legL.rotation.x = 0;
      f.legR.rotation.x = 0;
      f.armL.rotation.x = b;
      f.armR.rotation.x = -b;
      f.armL.rotation.z = 0.06;
      f.armR.rotation.z = -0.06;
      f.torso.rotation.x = 0;
      f.torso.rotation.y = 0;
      f.torso.position.y = 0.95 + b * 0.5;
      f.head.rotation.y = 0;
    }
    // Stagger flinch.
    if (this.staggerT > 0) f.torso.rotation.x -= 0.25 * (this.staggerT / 0.35);
    this.group.position.set(this.x, this.jumpY, this.z);
    this.group.rotation.y = this.yaw;
  }
}
