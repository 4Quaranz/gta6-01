// SUNPORT v2 — touch controls. Shown only on touch devices; every
// button and the joystick write the same Input flags the keyboard writes,
// so the game logic has a single input path. Camera drag uses pointer
// deltas on the game area (outside the buttons and the stick).

export class TouchUI {
  constructor(input, callbacks) {
    this.input = input;
    this.cb = callbacks;
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.stickId = null;
    this.stickCenter = { x: 0, y: 0 };
    this.camId = null;
    this.camLast = { x: 0, y: 0 };
  }

  attach() {
    if (!this.isTouch) return false;
    document.body.classList.add('touch');
    const ui = document.getElementById('touch-ui');
    ui.hidden = false;
    // --- Joystick ---------------------------------------------------------
    const stick = document.getElementById('stick');
    const knob = document.getElementById('knob');
    const R = 42;
    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      const r = stick.getBoundingClientRect();
      this.stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this._stickMove(e, R, setKnob);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      e.preventDefault();
      this._stickMove(e, R, setKnob);
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.input.stick.x = 0;
      this.input.stick.y = 0;
      setKnob(0, 0);
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
    // --- Camera drag on the game area --------------------------------------
    const game = document.getElementById('game');
    game.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (e.target.closest('#touch-ui')) return;
      this.camId = e.pointerId;
      this.camLast = { x: e.clientX, y: e.clientY };
    });
    game.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.camId) return;
      e.preventDefault();
      this.input.mouseDX += (e.clientX - this.camLast.x) * 2.2;
      this.input.mouseDY += (e.clientY - this.camLast.y) * 2.2;
      this.camLast = { x: e.clientX, y: e.clientY };
    });
    const endCam = (e) => { if (e.pointerId === this.camId) this.camId = null; };
    game.addEventListener('pointerup', endCam);
    game.addEventListener('pointercancel', endCam);
    // --- Action buttons -----------------------------------------------------
    const hold = (id, down, up) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('active');
        down();
      });
      const release = (e) => {
        el.classList.remove('active');
        if (up) up();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    };
    const tap = (id, fn) => hold(id, fn, null);
    tap('btn-enter', () => this.cb.onEnter());
    tap('btn-punch', () => this.cb.onPunch());
    tap('btn-reload', () => this.cb.onReload());
    tap('btn-interact', () => this.cb.onInteract());
    tap('btn-pause', () => this.cb.onPause());
    hold('btn-fire', () => { this.input.firing = true; this.cb.onFireStart(); }, () => { this.input.firing = false; this.cb.onFireStop(); });
    hold('btn-sprint', () => { this.input.sprintTouch = true; }, () => { this.input.sprintTouch = false; });
    return true;
  }

  _stickMove(e, R, setKnob) {
    let dx = e.clientX - this.stickCenter.x;
    let dy = e.clientY - this.stickCenter.y;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    setKnob(dx, dy);
    this.input.stick.x = dx / R;
    this.input.stick.y = dy / R;
  }
}
