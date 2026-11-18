// SUNPORT — touch controls for phones (DESIGN.md §10).
// Shown ONLY on touch devices ('ontouchstart' in window or
// maxTouchPoints > 0). Desktop keyboard+mouse is untouched: this module
// returns null there and creates nothing. Every touch control feeds the
// SAME input object the keyboard uses — joystick writes input.stick,
// buttons call input.press()/release(), drags add to input.lookDX/DY — so
// there is exactly one input path into the game.
export function createTouchControls(input) {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouch) return null;
  const ui = document.getElementById('touch-ui');
  if (!ui) return null;
  ui.hidden = false;
  document.body.classList.add('touch');

  const stick = document.getElementById('stick');
  const knob = document.getElementById('stick-knob');
  const R = 48; // joystick travel radius in px
  let stickId = null;
  let cx = 0; let cy = 0;

  function stickCenter() {
    const r = stick.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  stick.addEventListener('touchstart', (e) => {
    if (e.cancelable) e.preventDefault();
    const t = e.changedTouches[0];
    stickId = t.identifier;
    const c = stickCenter();
    cx = c.x; cy = c.y;
    moveStick(t);
  }, { passive: false });
  function moveStick(t) {
    let dx = t.clientX - cx;
    let dy = t.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    setKnob(dx, dy);
    input.stick.x = dx / R;
    input.stick.y = dy / R;
  }
  function endStick(t) {
    if (t.identifier !== stickId) return;
    stickId = null;
    input.stick.x = 0;
    input.stick.y = 0;
    setKnob(0, 0);
  }
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { if (e.cancelable) e.preventDefault(); moveStick(t); }
      else if (t.identifier === camId) { if (e.cancelable) e.preventDefault(); moveCam(t); }
    }
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) { endStick(t); endCam(t); }
  });
  window.addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) { endStick(t); endCam(t); }
  });

  // Action buttons: press-and-hold maps to the keyboard action of the
  // same name. FIRE holds input.firing like holding the mouse button.
  function bindButton(id, down, up) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); down(); }, { passive: false });
    el.addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault(); if (up) up(); }, { passive: false });
    el.addEventListener('touchcancel', () => { if (up) up(); });
  }
  bindButton('btn-enter', () => input.press('enterCar'), () => input.release('enterCar'));
  bindButton('btn-punch', () => input.press('punch'), () => input.release('punch'));
  bindButton('btn-fire', () => { input.firing = true; }, () => { input.firing = false; });
  bindButton('btn-reload', () => input.press('reload'), () => input.release('reload'));
  bindButton('btn-interact', () => input.press('enterCar'), () => input.release('enterCar'));
  bindButton('btn-pause', () => input.press('pause'), () => input.release('pause'));

  // Camera drag: any touch on the right side of the screen that did not
  // start on a control or a menu rotates the camera, like the mouse.
  let camId = null;
  let lastX = 0; let lastY = 0;
  window.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (el && (el.closest('#touch-ui') || el.closest('.overlay') || el.closest('button'))) continue;
      if (camId !== null) continue;
      if (t.clientX < window.innerWidth * 0.35) continue;
      camId = t.identifier;
      lastX = t.clientX; lastY = t.clientY;
    }
  }, { passive: true });
  function moveCam(t) {
    input.lookDX += (t.clientX - lastX) * 2.4;
    input.lookDY += (t.clientY - lastY) * 2.4;
    lastX = t.clientX; lastY = t.clientY;
  }
  function endCam(t) {
    if (t.identifier === camId) camId = null;
  }

  return {
    isTouch: true,
    setEnterLabel(text) {
      const el = document.getElementById('btn-enter');
      if (el) el.textContent = text;
    },
  };
}
