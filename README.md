# SUNPORT — Make GTA 6

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/4Quaranz/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/4Quaranz/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game in the spirit of GTA 6: explore the sun-soaked beach city of Sunport as Jace Moreno — steal cars and drive them, dodge the Sunport PD's wanted system with its helicopter, fight on foot, and run four "Sunport Nights" missions with Lena across Palmera Boulevard, the Neon Strip, the marina and the Cayo Verde lighthouse. Three.js, static files only, no network requests, keyboard + mouse on desktop and full touch controls on phones.

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no install.

## Controls

- **W A S D** — move / drive (W gas, S brake/reverse, A/D steer)
- **Shift** — sprint (drains stamina, shown in the HUD)
- **Space** — jump on foot / handbrake while driving
- **E** — enter / exit a car (stealing one raises your wanted level)
- **F** — punch (a punch buys 11.5 s of no-ram grace from police cars)
- **Left click** — shoot the pistol · **R** — reload · **1 / 2** — fists / pistol
- **Right-drag** — orbit the camera · **P / Esc** — pause · **M** — mute
- On phones: virtual joystick, camera drag, and ENTER / PUNCH / FIRE / RELOAD / INTERACT / SPRINT / PAUSE buttons appear automatically.

## What is in the game

- A full day/night cycle (golden hour, neon night) with ACES tone mapping, an animated sea, drifting clouds, swaying palms and lit windows.
- Six districts that feel different: Palmera Boulevard (pastel art-deco hotels), Solmar Beach (sand, lifeguard tower, umbrellas), Neon Strip (clubs), Downtown (glass towers), Rustport (port + warehouses) and Cayo Verde (an island across a causeway, with a lighthouse).
- Six car types plus police cars, a taxi and a van; glossy paint, headlights and taillights that switch on at night; traffic that flows and yields.
- A 0–5 star wanted system: police cars that approach, stand off and ram (never right after a punch), foot cops, and a searchlight helicopter at 4+ stars. Get busted and you start over.
- 36 sidewalk pedestrians plus beach walkers, all with faces (eyes, 3D noses, mouths — nine variants, some with glasses or hats) who walk, flee and stagger when hit.
- Four chained missions, "Sunport Nights" (Wheels / Pickup / Getaway / The Big One), with Jace–Lena dialogue in the HUD, a beacon on each target and cash rewards.
- A GTA-style HUD: minimap, wanted stars, health, stamina, money, district, clock, objective and speed; start / pause / busted screens; progress saved to localStorage; synthesized WebAudio sound (engine, siren, gunshots) with no audio files.

## Hand in

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory and writes `dossier.json` with the vendored make.fun library. Screenshots are real renders of the game itself, taken in a browser.

## License

MIT — see [LICENSE](LICENSE).

---

Optional: earn referral rewards, a second way to make money — [join make.fun with my referral link](https://make.fun/r/scveefga).
