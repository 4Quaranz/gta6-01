// SUNPORT — the hand-in program (Node 22, standard library only).
//
// It copies this repository's game/ and screenshots/ into the hand-in
// directory and writes dossier.json there, the summary the judge reads,
// using the vendored make.fun library (vendor/makefun-game.ts).
//
//   node main.ts
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Before writing the dossier it checks the scorer's caps and refuses
// loudly when the entry would be refused (too many files, game too big,
// a screenshot over its cap), so a bad hand-in never ships silently.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's caps (RULES.txt): the dossier text cap shapes the bytes;
// the rest refuse an entry the scorer would refuse.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function walkGame(dir, base = '') {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const rel = base ? `${base}/${name}` : name;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      const sub = walkGame(full, rel);
      files += sub.files;
      bytes += sub.bytes;
    } else if (st.isFile()) {
      files += 1;
      bytes += st.size;
      if (Buffer.byteLength(rel, 'utf8') > CAPS.game_path_max_bytes) {
        fail(`game path too long (${rel.length} bytes): ${rel}`);
      }
    } else {
      fail(`game/ holds a non-file, non-directory entry: ${rel}`);
    }
  }
  return { files, bytes };
}

// --- Pre-flight: refuse a hand-in the scorer would refuse. ---
const gameDir = join(here, 'game');
if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
const game = walkGame(gameDir);
if (game.files > CAPS.game_max_files) fail(`game/ has ${game.files} files (cap ${CAPS.game_max_files})`);
if (game.bytes > CAPS.game_max_bytes) fail(`game/ is ${game.bytes} bytes (cap ${CAPS.game_max_bytes})`);

const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ is missing');
const shots = readdirSync(shotsDir).filter((n) => !n.startsWith('.'));
if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
  fail(`screenshots/ holds ${shots.length} images (need 3-${CAPS.screenshots.max})`);
}
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > CAPS.screenshots.max_bytes) fail(`screenshot ${name} is ${size} bytes (cap ${CAPS.screenshots.max_bytes})`);
}

// --- Copy + dossier. ---
mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(
  `SUNPORT handed in: ${game.files} game files (${game.bytes} bytes), ` +
  `${shots.length} screenshots, dossier ${Buffer.byteLength(dossier, 'utf8')} bytes -> ${out}`,
);
