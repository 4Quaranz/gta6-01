// SUNPORT v2 — "Sunport Nights": four linked jobs for Jace and Lena.
// Wheels → Pickup → Getaway → The Big One. Each step has a beacon on
// the minimap, an objective line, short dialogue, and a payout.

import * as THREE from 'three';
import { GARAGE, TARGETS } from './config.js';
import { buildAvatar, poseWalk } from './player.js';

const DIALOGUE = {
  m0start: 'JACE: Butuh mobil. Yang mana saja — cepat.',
  m0car: 'LENA: Bagus. Bawa ke garasi Rico — jangan sampai ketangkap.',
  m0done: 'RICO: Mobil mulus. $500 buatmu, Jace.',
  m1start: 'LENA: Jemput aku di sudut Neon Strip. Cepat, sebelum Kane datang.',
  m1pick: 'LENA: Akhirnya. Ke marina, Jace. Ada yang harus kuambil.',
  m1done: 'LENA: Beres. $400. Kau masih bisa diandalkan.',
  m2start: 'JACE: Butuh panas. Buat polisi sibuk, lalu kabur ke Rustport.',
  m2hot: 'LENA: Bagus, mereka mengejarmu. Sekarang ke Rustport — cepat!',
  m2done: 'MAMA DELIA: Barang aman. $800. Jangan kembali ke sini dulu.',
  m3start: 'LENA: Ini yang besar. Bank Sunport. Masuk, ambil, kabur.',
  m3hold: 'JACE: Alarm bunyi. Tahan posisi sampai brankas terbuka!',
  m3run: 'LENA: Dapat! Ke pulau — jembatan Cayo Verde. Jangan berhenti!',
  m3done: 'JACE: Sunport Nights selesai. Kita kaya... untuk sekarang.',
};

export class Missions {
  constructor(scene, hud, audio) {
    this.scene = scene;
    this.hud = hud;
    this.audio = audio;
    this.idx = 0;
    this.step = 0;
    this.target = null;
    this.holdT = 0;
    this.done = false;
    // Lena: stands at the pickup point, follows Jace, rides along, leaves.
    this.lena = buildAvatar({ shirt: 0xd84a4a, pants: 0x2a2f38, skin: 0xe8b88a, hair: 0x2a1a1a, face: 6 });
    this.lena.group.visible = false;
    this.lenaState = 'hidden'; // hidden | waiting | follow | riding | leaving
    this.lenaPhase = 0;
    this.leaveT = 0;
    scene.add(this.lena.group);
  }

  reset() {
    this.idx = 0;
    this.step = 0;
    this.holdT = 0;
    this.done = false;
    this.lenaState = 'hidden';
    this.lena.group.visible = false;
    this.startMission(0);
  }

  startMission(i) {
    this.idx = i;
    this.step = 0;
    this.holdT = 0;
    if (i === 0) {
      this.target = null;
      this.hud.setObjective('Curi mobil apa saja');
      this.hud.setDialogue(DIALOGUE.m0start);
    } else if (i === 1) {
      this.target = { x: TARGETS.lenaPickup.x, z: TARGETS.lenaPickup.z };
      this.lenaState = 'waiting';
      this.lena.group.visible = true;
      this.lena.group.position.set(TARGETS.lenaPickup.x, 0, TARGETS.lenaPickup.z);
      this.hud.setObjective('Jemput Lena di Neon Strip');
      this.hud.setDialogue(DIALOGUE.m1start);
    } else if (i === 2) {
      this.target = null;
      this.hud.setObjective('Buat wanted naik ke 2 bintang');
      this.hud.setDialogue(DIALOGUE.m2start);
    } else if (i === 3) {
      this.target = { x: TARGETS.bank.x, z: TARGETS.bank.z };
      this.hud.setObjective('Pergi ke Bank Sunport');
      this.hud.setDialogue(DIALOGUE.m3start);
    }
  }

  complete(state, title, sub) {
    state.player.money += this.reward();
    this.audio.jingle();
    this.hud.showBanner(title, sub);
    if (this.idx >= 3) {
      this.done = true;
      this.target = null;
      this.hud.setObjective('Sunport Nights selesai!');
      this.hud.setDialogue(DIALOGUE.m3done);
    } else {
      this.startMission(this.idx + 1);
    }
    if (state.onMissionComplete) state.onMissionComplete();
  }

  reward() {
    return [500, 400, 800, 1500][this.idx] || 0;
  }

  distTo(p, t) {
    return Math.hypot(p.x - t.x, p.z - t.z);
  }

  update(dt, ctx) {
    const p = ctx.player;
    const state = ctx.state;
    if (this.done) return;
    // --- Lena's behaviour -------------------------------------------------
    if (this.lenaState === 'follow') {
      const bx = p.x - Math.sin(p.yaw) * 1.6;
      const bz = p.z - Math.cos(p.yaw) * 1.6;
      const d = Math.hypot(bx - this.lena.group.position.x, bz - this.lena.group.position.z);
      if (d > 0.4) {
        const sp = 4.6;
        this.lena.group.position.x += ((bx - this.lena.group.position.x) / d) * sp * dt;
        this.lena.group.position.z += ((bz - this.lena.group.position.z) / d) * sp * dt;
        this.lena.group.rotation.y = Math.atan2(bx - this.lena.group.position.x, bz - this.lena.group.position.z);
        this.lenaPhase += dt * sp * 2.1;
        poseWalk(this.lena, this.lenaPhase, 0.65, 0.05);
      }
      if (!p.onFoot) {
        this.lenaState = 'riding';
        this.lena.group.visible = false;
      }
    } else if (this.lenaState === 'riding' && p.onFoot) {
      this.lenaState = 'follow';
      this.lena.group.visible = true;
      this.lena.group.position.set(p.x + 1.5, 0, p.z + 1.5);
    } else if (this.lenaState === 'leaving') {
      this.leaveT -= dt;
      this.lena.group.position.z += 1.6 * dt;
      this.lenaPhase += dt * 3.4;
      poseWalk(this.lena, this.lenaPhase, 0.6, 0.04);
      if (this.leaveT <= 0) {
        this.lenaState = 'hidden';
        this.lena.group.visible = false;
      }
    } else if (this.lenaState === 'waiting') {
      // Idle sway at the pickup corner.
      const t = ctx.time;
      this.lena.armL.rotation.x = Math.sin(t * 1.2) * 0.05;
      this.lena.armR.rotation.x = -Math.sin(t * 1.2) * 0.05;
    }

    // --- Mission steps -----------------------------------------------------
    if (this.idx === 0) {
      if (this.step === 0) {
        if (p.car) {
          this.step = 1;
          this.target = { x: GARAGE.x, z: GARAGE.z };
          this.hud.setObjective("Bawa mobil ke Rico's Garage");
          this.hud.setDialogue(DIALOGUE.m0car);
        }
      } else if (this.step === 1) {
        if (this.distTo(p, GARAGE) < 12) {
          this.complete(state, 'WHEELS SELESAI', '+$500 — mobil sudah di garasi');
        }
      }
    } else if (this.idx === 1) {
      if (this.step === 0) {
        if (this.distTo(p, TARGETS.lenaPickup) < 4) {
          this.step = 1;
          this.target = { x: TARGETS.marinaMeet.x, z: TARGETS.marinaMeet.z };
          this.lenaState = 'follow';
          this.hud.setObjective('Antar Lena ke marina');
          this.hud.setDialogue(DIALOGUE.m1pick);
        }
      } else if (this.step === 1) {
        if (this.distTo(p, TARGETS.marinaMeet) < 10) {
          this.lenaState = 'leaving';
          this.leaveT = 3;
          this.complete(state, 'PICKUP SELESAI', '+$400 — Lena sudah di marina');
        }
      }
    } else if (this.idx === 2) {
      if (this.step === 0) {
        if (state.wanted >= 2) {
          this.step = 1;
          this.target = { x: TARGETS.rustportDrop.x, z: TARGETS.rustportDrop.z };
          this.hud.setObjective('Kabur ke Rustport — jangan sampai ketangkap');
          this.hud.setDialogue(DIALOGUE.m2hot);
        }
      } else if (this.step === 1) {
        if (this.distTo(p, TARGETS.rustportDrop) < 12 && state.wanted >= 1) {
          this.complete(state, 'GETAWAY SELESAI', '+$800 — lolos dari kejaran');
        }
      }
    } else if (this.idx === 3) {
      if (this.step === 0) {
        if (this.distTo(p, TARGETS.bank) < 6) {
          this.step = 1;
          this.holdT = 0;
          this.hud.setObjective('Tahan posisi di bank — brankas sedang dibuka');
          this.hud.setDialogue(DIALOGUE.m3hold);
        }
      } else if (this.step === 1) {
        if (this.distTo(p, TARGETS.bank) < 8) {
          this.holdT += dt;
          state.wantedHeat = Math.min(100, state.wantedHeat + 5 * dt);
          this.hud.setObjective(`Tahan posisi... ${Math.ceil(8 - this.holdT)} dtk`);
          if (this.holdT >= 8) {
            this.step = 2;
            this.target = { x: 320, z: 0 };
            this.hud.setObjective('Kabur ke Cayo Verde lewat jembatan');
            this.hud.setDialogue(DIALOGUE.m3run);
          }
        } else {
          this.holdT = Math.max(0, this.holdT - dt * 2);
        }
      } else if (this.step === 2) {
        if (this.distTo(p, { x: 320, z: 0 }) < 15) {
          this.complete(state, 'THE BIG ONE SELESAI', '+$1500 — Sunport Nights tamat');
        }
      }
    }
  }
}
