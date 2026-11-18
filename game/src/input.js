// SUNPORT v2 — one input path for keyboard, mouse and touch. Touch
// buttons and the joystick write the same flags the keyboard writes, so
// the game logic never knows which device is driving.

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, cleared by consume()
    this.stick = { x: 0, y: 0 };
    this.firing = false;
    this.sprintTouch = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.camDragging = false; // right button held: orbit the camera
  }

  attach() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.firing = false; this.camDragging = false; });
    // Left button shoots; right button orbits the camera. They used to
    // share the left button, so dragging the camera also fired the gun.
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.firing = true; }
      if (e.button === 2) { this.camDragging = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouseDown = false; this.firing = false; }
      if (e.button === 2) { this.camDragging = false; }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.camDragging) { this.mouseDX += e.movementX || 0; this.mouseDY += e.movementY || 0; }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Edge-triggered read: true once per physical press.
  consume(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }

  // Queue an edge-triggered action from a touch button (same as a key).
  queue(code) {
    this.pressed.add(code);
  }

  clearPressed() {
    this.pressed.clear();
  }

  get sprint() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintTouch;
  }

  // Movement vector in world space, from WASD/arrows or the stick,
  // relative to the camera yaw. y is forward (away from the camera).
  moveAxis(camYaw) {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    x += this.stick.x;
    y += -this.stick.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    // Rotate by camera yaw. The camera sits at player + (sin, cos) * dist,
    // so forward (W, away from the camera) is (-sin, -cos) and right (D)
    // is (cos, -sin).
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    return { x: x * cos - y * sin, z: -x * sin - y * cos, mag: Math.min(1, len) };
  }

  // Camera deltas accumulated since last read (mouse drag / touch drag).
  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }
}
