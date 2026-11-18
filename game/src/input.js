// SUNPORT — keyboard and mouse input.
// Held keys live in `keys`; one-shot taps (E, F, R, M, P, H) land in
// `pressed` and are consumed once by the main loop, so a quick tap between
// two slow frames is never lost. Mouse look is pointer-locked while playing.
export function createInput(canvas, onFirstClick) {
  const keys = new Set();
  const pressed = new Set();
  const input = {
    keys, pressed,
    lookDX: 0, lookDY: 0,
    firing: false, locked: false, shotMode: false,
    // Analog stick from the touch controls (x right, y up = forward).
    // Keyboard and touch both feed the same sets/vector: one input path.
    stick: { x: 0, y: 0 },
    press(action) { keys.add(action); pressed.add(action); },
    release(action) { keys.delete(action); },
    consumeLook() {
      const d = { dx: this.lookDX, dy: this.lookDY };
      this.lookDX = 0; this.lookDY = 0;
      return d;
    },
  };
  const KEYMAP = {
    KeyW: 'forward', ArrowUp: 'forward',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'run', ShiftRight: 'run',
    Space: 'jump',
    KeyE: 'enterCar',
    KeyF: 'punch',
    KeyR: 'reload',
    KeyM: 'mute',
    KeyP: 'pause',
    Escape: 'pause',
    KeyH: 'help',
  };
  window.addEventListener('keydown', (e) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    if (a === 'jump' || a === 'reload') e.preventDefault();
    if (!e.repeat) { keys.add(a); pressed.add(a); }
  });
  window.addEventListener('keyup', (e) => {
    const a = KEYMAP[e.code];
    if (a) keys.delete(a);
  });
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('mousemove', (e) => {
    if (!input.locked && !input.shotMode) return;
    input.lookDX += e.movementX || 0;
    input.lookDY += e.movementY || 0;
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (input.locked || input.shotMode) input.firing = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('click', () => {
    if (!input.locked && !input.shotMode) {
      canvas.requestPointerLock?.();
      onFirstClick?.();
    }
  });
  return input;
}
