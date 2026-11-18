// SUNPORT v3 — "Sunport Nights": four chained missions with short
// Jace–Lena dialogue in the HUD, a 3D beacon on the target, and rewards.
// Written fresh.
import * as THREE from 'three';
import { SPOTS } from './config.js';

const TARGETS = {
  garage: { x: 168, z: 160, r: 14, name: 'the garage' },
  pickup: { x: 64, z: -64, r: 12, name: 'Lena on the Neon Strip' },
  marina: { x: 192, z: 128, r: 12, name: 'the marina' },
  lighthouse: { x: -192, z: -192, r: 14, name: 'the Cayo Verde lighthouse' },
};

const MISSIONS = [
  {
    title: 'WHEELS',
    step0: 'Steal a car — press E near one',
    step1: 'Drive to the garage',
    say: 'Lena: Wheels first. Grab any car and meet me at the garage.',
    reply: 'Jace: On it. Sunport, here we go.',
    target: TARGETS.garage,
    reward: 500,
  },
  {
    title: 'PICKUP',
    step0: 'Drive to Lena on the Neon Strip',
    say: 'Lena: I am at the Strip, by the pink hotel. Hurry — the cops are bored tonight.',
    reply: 'Jace: Pink hotel. Got it.',
    target: TARGETS.pickup,
    reward: 300,
  },
  {
    title: 'GETAWAY',
    step0: 'Drive Lena to the marina',
    say: 'Lena: The boat leaves at midnight. Do NOT stop for anyone.',
    reply: 'Jace: Buckle up.',
    target: TARGETS.marina,
    reward: 800,
  },
  {
    title: 'THE BIG ONE',
    step0: 'Get to the Cayo Verde lighthouse',
    say: 'Lena: Take this pistol. The lighthouse crew is not friendly.',
    reply: 'Jace: Then we go loud.',
    target: TARGETS.lighthouse,
    reward: 1500,
  },
];

export class Missions {
  constructor(G) {
    this.G = G;
    this.idx = 0;
    this.step = 0;
    this.done = false;
    this.beacon = this.buildBeacon();
    G.scene.add(this.beacon.group);
    this.moveBeacon();
  }

  buildBeacon() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 15;
    group.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    return { group, beam, ring };
  }

  moveBeacon() {
    const m = MISSIONS[this.idx];
    if (!m || this.done) {
      this.beacon.group.visible = false;
      return;
    }
    this.beacon.group.visible = true;
    this.beacon.group.position.set(m.target.x, 0, m.target.z);
  }

  current() {
    return MISSIONS[this.idx] || null;
  }

  objective() {
    if (this.done) return 'Free roam — Sunport is yours. Missions complete!';
    const m = MISSIONS[this.idx];
    const p = this.G.player;
    let text = this.step === 0 && this.idx === 0 ? m.step0 : m.step1;
    if (this.idx > 0) text = m.step0;
    const d = Math.hypot(p.x - m.target.x, p.z - m.target.z);
    return `${m.title}: ${text} (${Math.round(d)}m)`;
  }

  dialogue() {
    if (this.done) return 'Lena: We did it. Sunport Nights — done.';
    const m = MISSIONS[this.idx];
    return `${m.say} ${m.reply}`;
  }

  complete() {
    const G = this.G;
    const m = MISSIONS[this.idx];
    G.player.money += m.reward;
    G.hud.banner(`${m.title} COMPLETE`, `+$${m.reward}`, 2600);
    G.audio.coin();
    G.saveGame();
    if (this.idx === 2) {
      // Mission 3 starts with the pistol.
      G.player.hasPistol = true;
      G.player.weapon = 'pistol';
      G.hud.banner('PISTOL ACQUIRED', 'Press 1/2 to switch — left click to shoot', 3200);
    }
    if (this.idx === 3) {
      this.done = true;
      this.idx = 4;
      this.step = 0;
      this.beacon.group.visible = false;
      G.hud.banner('SUNPORT NIGHTS COMPLETE', 'All four missions done. Free roam!', 4000);
      return;
    }
    this.idx += 1;
    this.step = 0;
    const next = MISSIONS[this.idx];
    G.hud.banner(next.title, next.say, 3400);
    this.moveBeacon();
  }

  update(dt) {
    if (this.done) return;
    const G = this.G;
    const p = G.player;
    const m = MISSIONS[this.idx];
    // Beacon pulse.
    const s = 1 + Math.sin(G.state.time * 3) * 0.18;
    this.beacon.ring.scale.set(s, s, 1);
    this.beacon.beam.material.opacity = 0.16 + Math.sin(G.state.time * 3) * 0.06;
    if (this.idx === 0 && this.step === 0) {
      if (!p.onFoot) {
        this.step = 1;
        G.hud.banner('GOT WHEELS', 'Now drive to the garage', 2200);
      }
      return;
    }
    const d = Math.hypot(p.x - m.target.x, p.z - m.target.z);
    if (d < m.target.r) {
      this.complete();
    }
  }

  reset() {
    this.idx = 0;
    this.step = 0;
    this.done = false;
    this.moveBeacon();
  }
}
