// SUNPORT v3 — cars: factory for 6 types + police + taxi + van, parked cars,
// flowing traffic, and the player's driving physics. Written fresh.
import * as THREE from 'three';
import { NS_ROADS, EW_ROADS, ROAD_W, CAR, SPOTS } from './config.js';
import { makeRng } from './rng.js';

const PAINT = {
  convertible: 0xe63946,
  sedan: 0x457b9d,
  muscle: 0x2a9d8f,
  sport: 0xf4a261,
  pickup: 0x6d6875,
  taxi: 0xffd23e,
  police: 0xf1faee,
  van: 0xb8c4cc,
};

function glowSprite(color, size) {
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
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false }));
  spr.scale.setScalar(size);
  return spr;
}

export function makeCar(type, colorHex) {
  const color = colorHex ?? PAINT[type] ?? 0x888888;
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 0.12, metalness: 0.6 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.7 });
  const dims = { convertible: [1.9, 0.62, 4.4], sedan: [1.85, 0.66, 4.3], muscle: [1.95, 0.7, 4.6], sport: [1.9, 0.55, 4.2], pickup: [2.0, 0.85, 4.8], taxi: [1.85, 0.66, 4.3], police: [1.9, 0.68, 4.5], van: [2.1, 1.5, 4.9] };
  const [w, h, len] = dims[type] || dims.sedan;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  // Cabin / glasshouse (convertible and pickup get a low open top instead).
  if (type !== 'convertible') {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, type === 'van' ? 1.0 : 0.55, len * 0.48), glass);
    cabin.position.set(0, 0.62 + h / 2 + (type === 'van' ? 0.55 : 0.28), -len * 0.05);
    cabin.castShadow = true;
    group.add(cabin);
  } else {
    for (const sx of [-0.55, 0.55]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x5a3a28, roughness: 0.9 }));
      seat.position.set(sx, 1.0, -0.2);
      group.add(seat);
    }
  }
  if (type === 'muscle') {
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 1.1), paint);
    scoop.position.set(0, 0.62 + h / 2 + 0.1, len * 0.28);
    group.add(scoop);
  }
  if (type === 'sport') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.5 }));
    spoiler.position.set(0, 1.15, -len / 2 + 0.15);
    group.add(spoiler);
  }
  if (type === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.5, len * 0.32), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 }));
    bed.position.set(0, 1.05, -len * 0.3);
    group.add(bed);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
    sign.position.set(0, 1.55, 0);
    group.add(sign);
  }
  if (type === 'police') {
    // Black hood + doors on a white body.
    const hood = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.1, len * 0.3), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.3 }));
    hood.position.set(0, 0.62 + h / 2 + 0.02, len * 0.32);
    group.add(hood);
  }
  // Wheels.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-w / 2 + 0.1, len / 2 - 0.85], [w / 2 - 0.1, len / 2 - 0.85], [-w / 2 + 0.1, -len / 2 + 0.85], [w / 2 - 0.1, -len / 2 + 0.85]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), rim);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, 0.36, wz);
    group.add(hub);
  }
  // Headlights + taillights (emissive so they read at night).
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffe9a8, emissiveIntensity: 0.25 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0xcc1111, emissiveIntensity: 0.4 });
  for (const sx of [-w / 2 + 0.3, w / 2 - 0.3]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.1), headMat);
    hl.position.set(sx, 0.68, len / 2 + 0.02);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.1), tailMat);
    tl.position.set(sx, 0.72, -len / 2 - 0.02);
    group.add(tl);
    const glow = glowSprite(0xffe9a8, 2.2);
    glow.position.set(sx, 0.68, len / 2 + 0.4);
    group.add(glow);
  }
  // Police light bar.
  let lightL = null;
  let lightR = null;
  if (type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }));
    bar.position.set(0, 1.42, -0.1);
    group.add(bar);
    lightL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.42), new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xff0000, emissiveIntensity: 1 }));
    lightL.position.set(-0.28, 1.44, -0.1);
    group.add(lightL);
    lightR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.42), new THREE.MeshStandardMaterial({ color: 0x0044cc, emissive: 0x0044ff, emissiveIntensity: 1 }));
    lightR.position.set(0.28, 1.44, -0.1);
    group.add(lightR);
  }
  const car = {
    type, group, wheels, headMat, tailMat, lightL, lightR,
    x: 0, z: 0, yaw: 0, speed: 0, length: len, width: w,
    police: type === 'police',
    parked: false,
    sync() {
      this.group.position.set(this.x, 0, this.z);
      this.group.rotation.y = this.yaw;
    },
    updateLights(time, nightF) {
      this.headMat.emissiveIntensity = 0.25 + nightF * 1.6;
      this.tailMat.emissiveIntensity = 0.4 + nightF * 1.2;
      if (this.lightL && this.lightR) {
        const on = Math.sin(time * 9) > 0;
        this.lightL.material.emissiveIntensity = on ? 2.6 : 0.25;
        this.lightR.material.emissiveIntensity = on ? 0.25 : 2.6;
      }
    },
    spinWheels(dt) {
      const a = (this.speed * dt) / 0.36;
      for (const w of this.wheels) w.rotation.x += a;
    },
  };
  car.sync();
  return car;
}

const TRAFFIC_TYPES = ['sedan', 'sedan', 'muscle', 'sport', 'pickup', 'taxi', 'van', 'convertible'];

export class Vehicles {
  constructor(G, seed = 7) {
    this.G = G;
    this.rng = makeRng(seed);
    this.parked = [];
    this.traffic = [];
    this.buildParked();
    this.buildTraffic();
  }

  reset() {
    for (const car of this.parked) this.G.scene.remove(car.group);
    for (const t of this.traffic) this.G.scene.remove(t.car.group);
    this.parked = [];
    this.traffic = [];
    this.rng = makeRng(7);
    this.buildParked();
    this.buildTraffic();
  }

  buildParked() {
    const spots = [
      { ...SPOTS.parked0, type: 'convertible', yaw: 0 },
      { x: 128, z: -40, type: 'sedan', yaw: Math.PI / 2 },
      { x: -64, z: 96, type: 'muscle', yaw: 0 },
      { x: 64, z: -128, type: 'taxi', yaw: Math.PI },
      { x: -128, z: 24, type: 'pickup', yaw: -Math.PI / 2 },
      { x: 0, z: 128, type: 'sport', yaw: 0 },
      { x: -192, z: -96, type: 'van', yaw: Math.PI / 2 },
      { x: 128, z: 176, type: 'sedan', yaw: Math.PI },
    ];
    for (const s of spots) {
      const car = makeCar(s.type);
      car.x = s.x;
      car.z = s.z;
      car.yaw = s.yaw;
      car.parked = true;
      car.sync();
      this.G.scene.add(car.group);
      this.parked.push(car);
    }
  }

  buildTraffic() {
    for (let i = 0; i < 22; i++) {
      const car = makeCar(this.rng.pick(TRAFFIC_TYPES));
      const ns = this.rng.chance(0.5);
      const roads = ns ? NS_ROADS : EW_ROADS;
      const line = this.rng.pick(roads);
      const t = {
        car,
        ns,
        line,
        pos: this.rng.range(-240, 240),
        dir: this.rng.chance(0.5) ? 1 : -1,
        lane: this.rng.pick([-2.4, 2.4]),
        speed: this.rng.range(8, 14),
        cruise: 0,
        stuck: 0,
      };
      t.cruise = t.speed;
      car.x = ns ? line + t.lane : t.pos;
      car.z = ns ? t.pos : line + t.lane;
      car.yaw = ns ? (t.dir > 0 ? 0 : Math.PI) : (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      car.sync();
      this.G.scene.add(car.group);
      this.traffic.push(t);
    }
  }

  nearestCar(x, z, radius) {
    let best = null;
    let bestD = radius;
    const consider = (car) => {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    };
    for (const c of this.parked) consider(c);
    for (const t of this.traffic) consider(t.car);
    return best;
  }

  // Player driving physics. input.axes(): y = throttle, x = steering.
  // Returns the car's signed speed.
  drivePlayer(car, input, dt) {
    const ax = input.axes();
    const throttle = ax.y;
    const steer = ax.x;
    if (throttle > 0) {
      car.speed = Math.min(CAR.maxSpeed, car.speed + CAR.accel * throttle * dt);
    } else if (throttle < 0) {
      if (car.speed > 0.5) {
        car.speed = Math.max(0, car.speed - CAR.brake * dt);
      } else {
        car.speed = Math.max(-CAR.maxReverse, car.speed + CAR.accel * 0.6 * throttle * dt);
      }
    } else {
      car.speed *= Math.max(0, 1 - 0.35 * dt);
      if (Math.abs(car.speed) < 0.05) car.speed = 0;
    }
    if (input.down('Space')) {
      const s = Math.sign(car.speed);
      car.speed -= s * Math.min(Math.abs(car.speed), CAR.handbrake * dt);
    }
    const steerAuthority = CAR.steer * THREE.MathUtils.clamp(Math.abs(car.speed) / 12, 0, 1);
    // D (steer +1) turns right, so yaw decreases.
    car.yaw -= steer * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);
    const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
    const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    const fixed = this.G.city.resolveCircle(nx, nz, CAR.radius);
    if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) {
      car.speed *= 0.45; // bumped something
    }
    car.x = fixed.x;
    car.z = fixed.z;
    car.sync();
    car.spinWheels(dt);
    return car.speed;
  }

  update(dt, time, nightF) {
    const G = this.G;
    const player = G.player;
    for (const t of this.traffic) {
      const car = t.car;
      // Slow down for anything ahead (player car, parked car, another car).
      let blocked = false;
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      const ahead = (ox, oz, r) => {
        const dx = ox - car.x;
        const dz = oz - car.z;
        const along = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        return along > 0 && along < 8 + r && side < 2.6;
      };
      if (player && !player.onFoot && player.car && ahead(player.car.x, player.car.z, 2)) blocked = true;
      if (player && player.onFoot && ahead(player.x, player.z, 1)) blocked = true;
      if (!blocked) {
        for (const p of this.parked) if (ahead(p.x, p.z, 2)) { blocked = true; break; }
      }
      if (!blocked) {
        for (const o of this.traffic) {
          if (o === t) continue;
          if (ahead(o.car.x, o.car.z, 2)) { blocked = true; break; }
        }
      }
      let target = blocked ? 0 : t.cruise;
      if (blocked) {
        t.stuck += dt;
        if (t.stuck > 4) {
          t.dir *= -1; // turn around instead of sitting forever
          t.stuck = 0;
        }
      } else {
        t.stuck = 0;
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      t.pos += t.dir * car.speed * dt;
      // Turn at intersections sometimes; wrap at the city edge.
      const crossings = t.ns ? EW_ROADS : NS_ROADS;
      for (const c of crossings) {
        if (Math.abs(t.pos - c) < 1.2 && this.rng.chance(dt * 0.25)) {
          const newLine = c;
          const newPos = t.line;
          t.ns = !t.ns;
          t.line = newLine;
          t.pos = newPos;
          t.dir = this.rng.chance(0.5) ? 1 : -1;
          break;
        }
      }
      if (t.pos > 250) { t.pos = 250; t.dir = -1; }
      if (t.pos < -250) { t.pos = -250; t.dir = 1; }
      car.x = t.ns ? t.line + t.lane : t.pos;
      car.z = t.ns ? t.pos : t.line + t.lane;
      car.yaw = t.ns ? (t.dir > 0 ? 0 : Math.PI) : (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      car.sync();
      car.spinWheels(dt);
      car.updateLights(time, nightF);
    }
    for (const p of this.parked) p.updateLights(time, nightF);
  }
}
