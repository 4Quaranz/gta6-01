// SUNPORT v3 — HUD: money, health, wanted stars, stamina, district,
// objective + dialogue, clock, minimap, banners, start / pause / end
// screens. All elements live in index.html; this file drives them.
// Written fresh.
import { DISTRICTS } from './config.js';

const WORLD = 520; // -260..260

export class Hud {
  constructor(G) {
    this.G = G;
    const q = (id) => document.getElementById(id);
    this.el = {
      money: q('money'),
      healthFill: q('health-fill'),
      stars: q('stars'),
      staminaFill: q('stamina-fill'),
      district: q('district'),
      objective: q('objective'),
      dialogue: q('dialogue'),
      clock: q('clock'),
      ammo: q('ammo'),
      weapon: q('weapon'),
      crosshair: q('crosshair'),
      banner: q('banner'),
      bannerTitle: q('banner-title'),
      bannerSub: q('banner-sub'),
      minimap: q('minimap'),
      btnEnter: q('btn-enter'),
      startScreen: q('start-screen'),
      pauseScreen: q('pause-screen'),
      endScreen: q('end-screen'),
      endTitle: q('end-title'),
      endSub: q('end-sub'),
      speed: q('speed'),
    };
    this.bannerT = 0;
    this.minimapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.mapT = 0;
  }

  districtAt(x, z) {
    if (x > 195) return 'Solmar Beach';
    for (const d of DISTRICTS) {
      if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
    }
    return 'Sunport';
  }

  banner(title, sub = '', ms = 2600) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    this.bannerT = ms / 1000;
  }

  showStart() {
    this.el.startScreen.classList.remove('hidden');
    this.el.pauseScreen.classList.add('hidden');
    this.el.endScreen.classList.add('hidden');
  }

  hideStart() {
    this.el.startScreen.classList.add('hidden');
  }

  showPause() {
    this.el.pauseScreen.classList.remove('hidden');
  }

  hidePause() {
    this.el.pauseScreen.classList.add('hidden');
  }

  showEnd(title, sub) {
    this.el.endTitle.textContent = title;
    this.el.endSub.textContent = sub;
    this.el.endScreen.classList.remove('hidden');
  }

  hideEnd() {
    this.el.endScreen.classList.add('hidden');
  }

  drawMinimap() {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const G = this.G;
    const S = 160;
    const toMap = (x, z) => [((x + WORLD / 2) / WORLD) * S, ((z + WORLD / 2) / WORLD) * S];
    ctx.fillStyle = '#0d2b1e';
    ctx.fillRect(0, 0, S, S);
    // Water (east) + beach.
    const [wx] = toMap(195, 0);
    ctx.fillStyle = '#1e6f8f';
    ctx.fillRect(wx, 0, S - wx, S);
    ctx.fillStyle = '#e8d9a0';
    ctx.fillRect(wx - 4, 0, 4, S);
    // Roads.
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 3;
    const roads = [-192, -128, -64, 0, 64, 128, 176];
    const ew = [-192, -128, -64, 0, 64, 128, 192];
    for (const r of roads) {
      const [x0] = toMap(r, 0);
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, S); ctx.stroke();
    }
    for (const r of ew) {
      const [, y0] = toMap(0, r);
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(S, y0); ctx.stroke();
    }
    // Mission target.
    const m = G.missions.current();
    if (m && !G.missions.done) {
      const [tx, ty] = toMap(m.target.x, m.target.z);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(tx, ty, 8 + Math.sin(G.state.time * 4) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    // Police (blue).
    ctx.fillStyle = '#4da6ff';
    for (const c of G.police.cars) {
      const [px, py] = toMap(c.car.x, c.car.z);
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player (white, with heading tick).
    const p = G.player;
    const [px, py] = toMap(p.x, p.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.sin(p.yaw) * 7, py + Math.cos(p.yaw) * 7);
    ctx.stroke();
  }

  update(dt) {
    const G = this.G;
    const p = G.player;
    const st = G.state;
    this.el.money.textContent = `$${p.money.toLocaleString('en-US')}`;
    this.el.healthFill.style.width = `${Math.max(0, p.health)}%`;
    this.el.staminaFill.style.width = `${Math.max(0, p.stamina)}%`;
    this.el.stars.textContent = '★'.repeat(st.wanted) + '☆'.repeat(Math.max(0, 5 - st.wanted));
    this.el.district.textContent = this.districtAt(p.x, p.z);
    this.el.objective.textContent = G.missions.objective();
    this.el.dialogue.textContent = G.missions.dialogue();
    const tod = st.timeOfDay;
    const hh = Math.floor(tod * 24);
    const mm = Math.floor((tod * 24 - hh) * 60);
    this.el.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.el.weapon.textContent = p.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
    this.el.ammo.textContent = p.weapon === 'pistol' ? `${p.mag} / ${p.reserve}` : '';
    if (this.el.btnEnter) {
      this.el.btnEnter.textContent = p.onFoot ? 'MASUK' : 'KELUAR MOBIL';
    }
    this.el.crosshair.classList.toggle('hidden', p.weapon !== 'pistol');
    const speedKmh = Math.round((p.onFoot ? p.speed : Math.abs(p.car ? p.car.speed : 0)) * 3.6);
    this.el.speed.textContent = `${speedKmh} km/h`;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.remove('show');
    }
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 0.12;
      this.drawMinimap();
    }
  }
}
