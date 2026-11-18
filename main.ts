// SUNPORT v2 — the hand-in program (Node 22, standard library only).
// It stages the entry for the scorer: copies this directory's game/ and
// screenshots/ into the output directory, then writes dossier.json there
// with the vendored make.fun library. The scorer runs the same
// buildDossier on the same caps, so the dossier it reads must equal the
// dossier this program writes — same inputs, same bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for
// /output; with no variable the program writes to /output.)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps for gta6-01 (from its gate.json): the text cap shapes
// the dossier's bytes; the others refuse an entry the scorer would refuse
// (more than 4 screenshots or one over 256 KiB; more than 993 files in
// game/ or 48 MiB of game files in all, or a game path over 1000 bytes —
// game/ counts beside the output's own 1000-entry cap, with screenshots/
// and dossier.json).
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

function stageDir(name: string): void {
  const src = join(here, name);
  const dst = join(out, name);
  mkdirSync(dst, { recursive: true });
  if (existsSync(src)) cpSync(src, dst, { recursive: true });
}

mkdirSync(out, { recursive: true });
stageDir('game');
stageDir('screenshots');

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
