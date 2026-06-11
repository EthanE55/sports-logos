// Walks every team's primary SVG on disk and removes its algorithmic mono
// variants (`__mono-black.svg` / `__mono-white.svg`) when the primary is a
// "complex" logo that mixes dark + light form elements. The auto-mono for
// these teams collapses into a useless blob — see Missouri Tigers or
// Arkansas Razorbacks, which both have an implicit-black outer shape plus
// a white interior detail.
//
// Pack-supplied mono variants (`__pack-mono.svg`) are left untouched —
// those are designer-crafted single-colour artwork.

import { readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldGenerateMono } from '../mono.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.resolve(__dirname, '../../data/logos');

const files = await readdir(LOGO_DIR);
const primaries = files.filter((f) => f.endsWith('.svg') && !f.includes('__'));

let kept = 0;
let removed = 0;
const removedTeams: string[] = [];

for (const primary of primaries) {
  const teamId = primary.slice(0, -4);
  const svgPath = path.join(LOGO_DIR, primary);
  let svg: string;
  try {
    svg = await readFile(svgPath, 'utf8');
  } catch {
    continue;
  }
  const ok = shouldGenerateMono(svg);
  if (ok) {
    kept++;
    continue;
  }
  // Delete the auto-generated mono pair if present. Leave pack-mono alone.
  for (const tone of ['mono-black', 'mono-white']) {
    const monoFile = path.join(LOGO_DIR, `${teamId}__${tone}.svg`);
    try {
      await unlink(monoFile);
      removed++;
    } catch {
      // file didn't exist — fine
    }
  }
  removedTeams.push(teamId);
}

console.log(`Primaries inspected     : ${primaries.length}`);
console.log(`Kept (mono ok)          : ${kept}`);
console.log(`Cleaned (mono inferior) : ${removedTeams.length} teams (${removed} files removed)`);
if (removedTeams.length > 0) {
  console.log();
  console.log('Teams that lost their auto-mono variants:');
  for (const t of removedTeams) console.log(`  - ${t}`);
}
