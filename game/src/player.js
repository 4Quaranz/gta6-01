// SUNPORT — Jace Moreno on foot, and the third-person camera.
// WASD moves relative to the camera, Shift runs, Space jumps. The camera
// orbits with the mouse (pointer lock) and sits behind the player; when
// Jace drives, it swings behind the car instead. The player mesh is a
// simple low-poly figure: teal jacket, dark jeans, cap.
import * as THREE from 'three';
import { CFG } from './config.js';

export function createPlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f8a70 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3242 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98e6b });
  const cap = new THREE.MeshLambertMaterial({ color: 0xffd24a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.5), jacket);
  torso.position.y = 1.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin);
  head.position.y = 2.0;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 12), cap);
  hat.position.y = 2.26;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.85, 0.4), jeans);
  legL.position.set(-0.22, 0.42, 0);
  const legR = legL.clone();
  legR.position.x = 0.22;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.32), jacket);
  armL.position.set(-0.6, 1.25, 0);
  const armR = armL.clone();
  armR.position.x = 0.6;
  g.add(torso, head, hat, legL, legR, armL, armR);
  g.userData.legs = [legL, legR];
  g.userData.arms = [armL, armR];
  return g;
}

export function createPlayer() {
  return {
    x: -20, z: 20, y: 0, vy: 0,
    yaw: Math.PI, camYaw: Math.PI, camPitch: 0.28,
    hp: CFG.playerHp, money: CFG.startMoney,
    onFoot: true, car: null,
    weapon: 'fists', hasPistol: false, mag: 0, reserve: 0,
    reloading: false, reloadT: 0,
    speed: 0, grounded: true, walkPhase: 0,
    mesh: null,
  };
}

export function stepPlayerOnFoot(p, input, dt, city) {
  const look = input.consumeLook();
  p.camYaw -= look.dx * 0.0026;
  p.camPitch = Math.max(-0.15, Math.min(1.0, p.camPitch + look.dy * 0.0022));
  const k = input.keys;
  const st = input.stick || { x: 0, y: 0 };
  const f = Math.max(-1, Math.min(1, (k.has('forward') ? 1 : 0) - (k.has('back') ? 1 : 0) - st.y));
  const s = Math.max(-1, Math.min(1, (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0) + st.x));
  const mag = Math.min(1, Math.hypot(f, s));
  // Full stick tilt runs, like holding Shift; a half tilt walks slower.
  const baseSpeed = (k.has('run') || mag > 0.85) ? CFG.runSpeed : CFG.walkSpeed;
  const speed = baseSpeed * (mag > 0.01 ? Math.max(0.35, mag) : 1);
  const sin = Math.sin(p.camYaw);
  const cos = Math.cos(p.camYaw);
  // Forward is -z rotated by camYaw; strafe is perpendicular.
  let mx = (-sin * f + cos * s);
  let mz = (-cos * f - sin * s);
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx /= len; mz /= len;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    p.yaw = Math.atan2(mx, mz);
    p.speed = speed;
    p.walkPhase += dt * speed * 1.6;
  } else {
    p.speed = 0;
  }
  if (k.has('jump') && p.grounded) {
    p.vy = CFG.jumpSpeed;
    p.grounded = false;
  }
  if (!p.grounded) {
    p.vy -= CFG.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; }
  }
  city.collideCircle(p, CFG.playerRadius);
  if (p.mesh) {
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.y = p.yaw;
    const swing = p.speed > 0.1 ? Math.sin(p.walkPhase) * 0.5 : 0;
    p.mesh.userData.legs[0].rotation.x = swing;
    p.mesh.userData.legs[1].rotation.x = -swing;
    p.mesh.userData.arms[0].rotation.x = -swing * 0.8;
    p.mesh.userData.arms[1].rotation.x = swing * 0.8;
  }
}

export function updateCamera(p, camera, dt, fx) {
  const dist = CFG.camDist;
  const target = p.onFoot
    ? { x: p.x, y: p.y + 1.6, z: p.z }
    : { x: p.car.x, y: 1.6, z: p.car.z };
  const yaw = p.onFoot ? p.camYaw : p.car.heading + Math.PI;
  const pitch = p.onFoot ? p.camPitch : 0.32;
  const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
  const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
  const cy = target.y + Math.sin(pitch) * dist + 1.2;
  const sh = fx.shakeOffset();
  camera.position.set(cx + sh.x, cy + sh.y, cz);
  camera.lookAt(target.x, target.y + 0.6, target.z);
  // FOV kick while speeding, like a chase cam: wider and lower at speed.
  const speedFrac = p.onFoot ? 0 : Math.min(1, Math.abs(p.car.speed) / CFG.carMaxSpeed);
  const wantFov = 70 + speedFrac * 12;
  if (Math.abs(camera.fov - wantFov) > 0.5) {
    camera.fov = wantFov;
    camera.updateProjectionMatrix();
  }
}
