# SUNPORT — Kota Pantai, Satu Malam, Empat Misi

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![rank](https://make.fun/badge/gta6-01/4Quaranz/gta6-01/rank.svg)](https://make.fun/competitions/gta6-01)
[![reward](https://make.fun/badge/gta6-01/4Quaranz/gta6-01/reward.svg)](https://make.fun/competitions/gta6-01)

> Referral: `scveefga`

**SUNPORT** adalah game open-world 3D bergaya GTA 6 — orisinal sepenuhnya
(bukan Vice City, bukan Rockstar): kota pantai fiktif dengan boulevard hotel
Art Deco pastel, laut turquoise, Neon Strip, Downtown, Rustport, dan pulau
Cayo Verde di seberang jembatan. Jace Moreno dan Lena Cruz menjalani empat
misi "Sunport Nights": curi mobil, jemput Lena, buat wanted 2 bintang, lalu
rampok Bank Sunport dan kabur ke pulau.

## Cara main

Buka `game/index.html` di browser (atau `node serve.ts` lalu buka
http://localhost:8080). Tanpa network, tanpa instalasi — semua aset dibuat
dari kode (three.js di-vendor di `game/vendor/`).

- **Keyboard:** WASD jalan · Shift lari · E masuk/keluar mobil · F pukul ·
  klik tembak · R reload · 1/2 ganti senjata (tinju/pistol) · P jeda · M bisu
- **HP (sentuh):** joystick kiri untuk jalan/mengemudi · tombol kanan: MASUK
  MOBIL, PUKUL, TEMBAK, RELOAD, INTERAKSI, LARI · drag layar kanan untuk
  kamera · tombol II untuk jeda

## Yang ada di game

- **Kota yang rapi dan hidup:** grid jalan yang jelas, blok kota teratur,
  tiap distrik terasa beda — menara kaca Downtown, hotel pastel Palmera
  Boulevard (balkon, kanopi, neon), klub Neon Strip, gudang Rustport
  (silo, kontainer, dermaga). Gedung punya atap berundak, AC, antena,
  papan reklame 3D, gapura SUNPORT, monumen, halte, kios, dan lampu jalan.
- **Dunia bergerak:** pejalan kaki benar-benar berjalan di trotoar (ayun
  lengan/kaki, ada yang jogging, duduk di pantai, lari ketakutan saat ada
  keributan), lalu lintas mengalir dan berbelok di persimpangan, awan
  melintasi langit, palem bergoyang, laut bergerak, yacht mengapung,
  pesawat lewat, neon berkedip di malam hari.
- **Animasi pukul:** ayunan lengan penuh + badan membungkuk/maju + garis
  gerak + musuh terhuyung. Polisi tidak langsung menabrak setelah pukulan —
  mereka mendekat, melambat, mengitari dari jarak aman, dan baru boleh
  menabrak setelah jeda beberapa detik (atau saat wanted sudah 4 bintang).
- **LARI (sprint):** tombol LARI di HP + Shift di keyboard, dengan stamina
  (habis saat lari, isi ulang saat jalan) dan indikator di HUD.
- **Wanted 0–5 bintang:** mobil polisi + polisi jalan kaki mengejar,
  helikopter dengan sorot lampu di 4+ bintang, BUSTED kalau polisi
  menangkapmu, WASTED kalau nyawamu habis.
- **4 misi berantai** dengan dialog Jace–Lena, marker di minimap, dan
  hadiah $500 / $400 / $800 / $1500.
- **Siklus siang/malam** (~4 menit): fajar, siang, golden hour, senja,
  malam neon — jendela menyala, lampu jalan dan neon hidup.
- **HUD ala GTA:** minimap, bintang, uang, nyawa, stamina, senjata/ammo,
  kecepatan, distrik, objektif, dan dialog.
- **Save** otomatis tiap misi selesai + tombol SIMPAN di menu jeda
  (localStorage).
- **Audio synth WebAudio** (tanpa file): ombak, mesin, sirene, pukulan,
  tembakan, dan jingle misi.

## Struktur

```
main.ts            program hand-in (Node 22, stdlib) — salin game/ +
                   screenshots/ ke /output, tulis dossier.json
game/
  index.html       halaman game + HUD + kontrol sentuh
  src/             config, rng, audio, effects, city, daynight, hud,
                   input, player, pedestrians, vehicles, police,
                   combat, missions, save, touch, shots, main
  vendor/three/    three.js (vendored)
serve.ts           server statis lokal untuk game/
shots.json         4 shot untuk screenshot
screenshots/       01-start, 02-street, 03-drive, 04-chase
vendor/
  makefun-game.ts  library dossier make.fun (vendored)
```

## Screenshot

1. `01-start` — judul SUNPORT di Palmera Boulevard saat golden hour.
2. `02-street` — siang di boulevard: Jace jalan kaki, kerumunan, lalu lintas.
3. `03-drive` — mengemudi convertible saat golden hour.
4. `04-chase` — kejar-kejaran polisi di jembatan saat senja, helikopter di atas.
