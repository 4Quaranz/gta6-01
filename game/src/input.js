// SUNPORT v3 — one input surface for keyboard + mouse + touch.
// Touch controls (touch.js) write into the same fields, so the game logic
// never cares which device produced an action.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, consumed by consume()
    this.stick = { x: 0, y: 0 }; // touch joystick, -1..1 (y negative = up)
    this.sprintTouch = false; // touch LARI button held
    this.firing = false; // left mouse held or touch FIRE held
    this.camDX = 0; // accumulated mouse-drag deltas, consumed per frame
    this.camDY = 0;
    this.dragging = false;
    this.dragButton = -1;

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.firing = false;
      this.dragging = false;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // touch is handled by touch.js
      if (e.button === 2) {
        this.dragging = true;
        this.dragButton = 2;
      } else if (e.button === 0) {
        this.firing = true;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerType === 'touch') return;
      this.camDX += e.movementX || 0;
      this.camDY += e.movementY || 0;
    });
    const stopDrag = (e) => {
      if (e.button === 2) this.dragging = false;
      if (e.button === 0) this.firing = false;
    };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
    canvas.addEventListener('pointerleave', () => {
      this.dragging = false;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once per physical press.
  consume(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  clearPressed() {
    this.pressed.clear();
  }

  get sprint() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintTouch;
  }

  // Movement axes in camera space: x = strafe right, y = forward.
  // Keyboard (WASD/arrows) and the touch stick share this.
  axes() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    x += this.stick.x;
    y += -this.stick.y; // stick up (negative y) means forward
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  // Camera deltas since the last frame; calling this zeroes them.
  takeCamDelta() {
    const d = { x: this.camDX, y: this.camDY };
    this.camDX = 0;
    this.camDY = 0;
    return d;
  }
}
