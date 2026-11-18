// SUNPORT v3 — screenshot scenes for the entry (start / street / drive /
// chase). The kit's playtest drives ?shot=<name>: the scene is arranged,
// rendered, and window.__shotReady is set when it is safe to capture.
// Written fresh.
import { SPOTS } from './config.js';

export const SHOT_NAMES = ['start', 'street', 'drive', 'chase'];

export function setupShot(G, name) {
  const player = G.player;
  const st = G.state;
  window.__shotReady = false;
  if (name === 'start') {
    // Title view: Jace on the boulevard at golden hour, city behind.
    player.x = SPOTS.spawn.x;
    player.z = SPOTS.spawn.z + 6;
    player.yaw = Math.PI;
    player.camYaw = Math.PI;
    player.camPitch = 0.18;
    st.timeOfDay = 0.72;
  } else if (name === 'street') {
    // Street level: Jace walking among pedestrians in Palmera.
    player.x = 70;
    player.z = -60;
    player.yaw = 0;
    player.camYaw = 0.15;
    player.camPitch = 0.28;
    st.timeOfDay = 0.68;
  } else if (name === 'drive') {
    // Driving a convertible down Palmera Boulevard at dusk.
    const car = G.vehicles.parked.find((c) => c.type === 'convertible') || G.vehicles.parked[0];
    player.x = car.x;
    player.z = car.z;
    player.enterCar(car);
    car.speed = 16;
    car.yaw = 0;
    car.sync();
    player.camYaw = 0;
    player.camPitch = 0.3;
    st.timeOfDay = 0.76;
  } else if (name === 'chase') {
    // Police chase at night: wanted 3, cars + heli behind Jace.
    player.x = SPOTS.spawn.x;
    player.z = SPOTS.spawn.z;
    player.yaw = 0;
    player.camYaw = 0.1;
    player.camPitch = 0.3;
    st.timeOfDay = 0.88;
    G.setWanted(85); // 4 stars: police cars + helicopter (main.js arranges them).
    return;
  }
  // Let the renderer draw one frame, then signal ready.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
    });
  });
}
