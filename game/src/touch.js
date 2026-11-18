// SUNPORT v3 — touch controls: virtual joystick, camera drag, and the
// action buttons (ENTER / PUNCH / FIRE / RELOAD / INTERACT / SPRINT /
// PAUSE). Shown only on touch devices. The joystick and buttons write
// straight into the shared Input fields (input.stick, input.firing,
// input.sprintTouch, input.camDX/camDY), so the game logic never cares
// which device produced an action. Written fresh.
export class TouchControls {
  constructor(G) {
    this.G = G;
    this.active = false;
    this.stickId = null;
    this.camId = null;
    this.camLast = { x: 0, y: 0 };
    this.detect();
  }

  detect() {
    const isTouch =
      'ontouchstart' in window ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      navigator.maxTouchPoints > 0;
    if (!isTouch) {
      document.body.classList.remove('touch');
      return;
    }
    this.active = true;
    document.body.classList.add('touch');
    this.bind();
  }

  bind() {
    const q = (id) => document.getElementById(id);
    const input = this.G.input;
    const ui = q('touch-ui');
    if (ui) ui.hidden = false;
    // Joystick: drag the stick, it writes to input.stick (y negative = up).
    const stick = q('stick');
    const zone = q('stick-zone');
    if (stick && zone) {
      const setStick = (clientX, clientY) => {
        const r = zone.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let dx = (clientX - cx) / (r.width / 2);
        let dy = (clientY - cy) / (r.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          dx /= len;
          dy /= len;
        }
        input.stick.x = dx;
        input.stick.y = dy;
        stick.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
      };
      const resetStick = () => {
        input.stick.x = 0;
        input.stick.y = 0;
        stick.style.transform = 'translate(-50%, -50%)';
      };
      zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.stickId = e.changedTouches[0].identifier;
        setStick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }, { passive: false });
      zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === this.stickId) setStick(t.clientX, t.clientY);
        }
      }, { passive: false });
      const end = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === this.stickId) {
            this.stickId = null;
            resetStick();
          }
        }
      };
      zone.addEventListener('touchend', end);
      zone.addEventListener('touchcancel', end);
    }
    // Camera drag: touch the right half of the screen and drag.
    const game = q('game');
    if (game) {
      game.addEventListener('touchstart', (e) => {
        for (const t of e.changedTouches) {
          if (t.clientX > window.innerWidth * 0.4 && this.camId === null) {
            this.camId = t.identifier;
            this.camLast = { x: t.clientX, y: t.clientY };
          }
        }
      }, { passive: true });
      game.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === this.camId) {
            const dx = t.clientX - this.camLast.x;
            const dy = t.clientY - this.camLast.y;
            this.camLast = { x: t.clientX, y: t.clientY };
            input.camDX += dx;
            input.camDY += dy;
          }
        }
      }, { passive: true });
      const endCam = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === this.camId) this.camId = null;
        }
      };
      game.addEventListener('touchend', endCam);
      game.addEventListener('touchcancel', endCam);
    }
    // Action buttons.
    const press = (id, down, up) => {
      const el = q(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        down();
      }, { passive: false });
      if (up) {
        el.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
        el.addEventListener('touchcancel', () => up(), { passive: true });
      }
      // No click fallback: a tap already fires touchstart, and a click
      // handler would run the same action twice (enter then exit).
    };
    const G = this.G;
    press('btn-enter', () => G.tryEnterExitCar());
    press('btn-punch', () => G.tryPunch());
    press('btn-fire',
      () => { input.firing = true; },
      () => { input.firing = false; });
    press('btn-reload', () => G.tryReload());
    press('btn-interact', () => G.tryInteract());
    press('btn-sprint',
      () => { input.sprintTouch = true; },
      () => { input.sprintTouch = false; });
    press('btn-pause', () => G.togglePause());
  }
}
