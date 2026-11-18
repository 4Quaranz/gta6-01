// SUNPORT v2 — the GTA-style HUD: minimap bottom-left, wanted stars and
// money top-right, health + stamina bottom-left, weapon and speed
// bottom-right, objective and district top-left, dialogue and banners.

import { WORLD, ROADS_X, ROADS_Z, districtAt } from './config.js';

export class HUD {
  constructor() {
    this.el = {};
    const ids = ['minimap', 'hp-num', 'hp-fill', 'stamina-fill', 'stamina',
      'weapon', 'ammo-big', 'speed', 'stars', 'money', 'objective',
      'district', 'dialogue', 'hint', 'banner', 'banner-title', 'banner-sub',
      'dmg', 'hud'];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.mm = this.el.minimap.getContext('2d');
    this.bannerT = 0;
    this.dialogueT = 0;
    this.dmgT = 0;
    this.mapW = 180;
    this.mapH = 180;
  }

  worldToMap(x, z) {
    const fx = (x - WORLD.minX) / (WORLD.maxX - WORLD.minX);
    const fz = (z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ);
    return { x: fx * this.mapW, y: fz * this.mapH };
  }

  drawMinimap(state) {
    const g = this.mm;
    const W = this.mapW;
    const H = this.mapH;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#1d2b1a';
    g.fillRect(0, 0, W, H);
    // Sea + beach on the east.
    const sea = this.worldToMap(WORLD.seaX, 0);
    g.fillStyle = '#0a6f7d';
    g.fillRect(sea.x, 0, W - sea.x, H);
    const beach = this.worldToMap(WORLD.beachX0, 0);
    g.fillStyle = '#eed9a4';
    g.fillRect(beach.x, 0, sea.x - beach.x, H);
    // Roads.
    g.strokeStyle = '#5a6068';
    g.lineWidth = 3;
    for (const rx of ROADS_X) {
      const a = this.worldToMap(rx, WORLD.minZ);
      const b = this.worldToMap(rx, WORLD.maxZ);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    for (const rz of ROADS_Z) {
      const a = this.worldToMap(WORLD.minX, rz);
      const b = this.worldToMap(WORLD.maxX, rz);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    // Mission target: pulsing yellow diamond.
    const tgt = state.missionTarget;
    if (tgt) {
      const p = this.worldToMap(tgt.x, tgt.z);
      const r = 4 + Math.sin(state.time * 5) * 1.5;
      g.fillStyle = '#ffd24a';
      g.beginPath();
      g.moveTo(p.x, p.y - r); g.lineTo(p.x + r, p.y);
      g.lineTo(p.x, p.y + r); g.lineTo(p.x - r, p.y);
      g.closePath(); g.fill();
    }
    // Police blips: red for cars, blue for foot cops.
    g.fillStyle = '#ff5544';
    for (const c of state.policeCars) {
      const p = this.worldToMap(c.x, c.z);
      g.beginPath(); g.arc(p.x, p.y, 3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#5aa2ff';
    for (const c of state.cops) {
      const p = this.worldToMap(c.x, c.z);
      g.beginPath(); g.arc(p.x, p.y, 2.4, 0, Math.PI * 2); g.fill();
    }
    // Player arrow, rotated by heading.
    const p = this.worldToMap(state.player.x, state.player.z);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(-state.player.yaw + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5);
    g.closePath(); g.fill();
    g.restore();
    // North marker.
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = 'bold 10px system-ui, sans-serif';
    g.fillText('N', 5, 12);
  }

  showBanner(title, sub) {
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub || '';
    this.el.banner.hidden = false;
    this.bannerT = 3.5;
  }

  setDialogue(text) {
    this.el.dialogue.textContent = text;
    this.dialogueT = 4.5;
  }

  setObjective(text) {
    this.el.objective.textContent = text;
  }

  setDistrict(name) {
    this.el.district.textContent = name;
  }

  setHint(text) {
    this.el.hint.textContent = text || '';
  }

  flashDamage() {
    this.dmgT = 0.5;
  }

  showEnd(title, sub) {
    const end = document.getElementById('end');
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-sub').textContent = sub || '';
    end.hidden = false;
  }

  hideEnd() {
    document.getElementById('end').hidden = true;
  }

  update(state, dt) {
    const p = state.player;
    this.el['hp-num'].textContent = Math.max(0, Math.round(p.health));
    this.el['hp-fill'].style.width = `${Math.max(0, p.health)}%`;
    this.el['hp-fill'].style.background = p.health > 50 ? '#39d353' : p.health > 25 ? '#ffd24a' : '#ff5544';
    // Stamina bar under the health bar.
    this.el['stamina-fill'].style.width = `${Math.max(0, p.stamina)}%`;
    this.el['stamina-fill'].style.background = p.stamina > 30 ? '#39d353' : p.stamina > 15 ? '#ffd24a' : '#ff5544';
    this.el.stamina.style.opacity = p.sprinting || p.stamina < 99 ? '1' : '0.45';
    // Wanted stars.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.style.color = state.wanted > 0 ? '#ff5544' : '#888888';
    this.el.money.textContent = `$${Math.floor(p.money)}`;
    this.el.weapon.textContent = p.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
    this.el['ammo-big'].textContent = p.weapon === 'pistol' ? `${p.mag} / ${p.reserve}` : '—';
    this.el.speed.textContent = p.onFoot ? '' : `${Math.round(Math.abs(p.car ? p.car.speed : 0) * 3.6)} km/h`;
    this.el.district.textContent = districtAt(p.x, p.z);
    this.drawMinimap(state);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.hidden = true;
    }
    if (this.dialogueT > 0) {
      this.dialogueT -= dt;
      this.el.dialogue.style.opacity = this.dialogueT < 1 ? String(Math.max(0, this.dialogueT)) : '1';
      if (this.dialogueT <= 0) this.el.dialogue.textContent = '';
    }
    if (this.dmgT > 0) {
      this.dmgT -= dt;
      this.el.dmg.style.opacity = String(Math.max(0, this.dmgT * 1.1));
    }
  }
}
