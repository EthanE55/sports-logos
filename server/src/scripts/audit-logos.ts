// Audits every team's primary SVG against its seed colour palette. Returns
// a flat list of "suspicious" teams — those whose primary contains NO fill
// within a luminance-aware distance of any seed colour. Catches cases like
// the Arkansas SEC-placeholder that slipped past name-token matching but
// produces a clearly wrong palette.
//
// Run with:  tsx src/scripts/audit-logos.ts
//
// Output is JSON on stdout if `--json` is passed; otherwise human-readable.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAMS } from '../teams.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.resolve(__dirname, '../../data/logos');

const NEUTRAL = new Set(['#000000', '#ffffff', '#fff', '#000']);
// Teams flagged when no fill in their primary SVG is within this distance
// of any non-neutral seed colour. 95 in RGB-Euclidean covers "same-family"
// shades (slightly off blue vs canonical blue) while still rejecting
// completely unrelated palettes.
const DISTANCE_THRESHOLD = 95;

function hex2rgb(c: string): [number, number, number] {
  let s = c.toLowerCase();
  if (s === 'black') return [0, 0, 0];
  if (s === 'white') return [255, 255, 255];
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  if (s.length !== 6) return [128, 128, 128];
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hex2rgb(a);
  const [r2, g2, b2] = hex2rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function normaliseHex(c: string): string {
  let s = c.toLowerCase();
  if (s.startsWith('#') && s.length === 4) {
    s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  return s;
}

function extractFills(svg: string): string[] {
  const fills = new Set<string>();
  for (const m of svg.matchAll(
    /(?:fill="|fill:\s*|stop-color="|stop-color:\s*)(#[0-9A-Fa-f]{3,8}|[a-zA-Z]+)/g,
  )) {
    const c = normaliseHex(m[1]);
    if (NEUTRAL.has(c) || c === 'none' || c === 'transparent') continue;
    fills.add(c);
  }
  return [...fills];
}

type Suspect = {
  teamId: string;
  name: string;
  league: string;
  sport: string;
  fills: string[];
  seed: string[];
  minDistance: number;
  reason: string;
};

const wantJson = process.argv.includes('--json');
const suspects: Suspect[] = [];
const stats = { checked: 0, monochromeLogo: 0, monochromePalette: 0 };

for (const team of TEAMS) {
  const filePath = path.join(LOGO_DIR, `${team.id}.svg`);
  if (!existsSync(filePath)) continue;
  stats.checked++;

  const svg = await readFile(filePath, 'utf8');
  const fills = extractFills(svg);
  if (fills.length === 0) {
    stats.monochromeLogo++;
    continue;
  }

  const expected = team.colors.map(normaliseHex).filter((c) => !NEUTRAL.has(c));
  if (expected.length === 0) {
    stats.monochromePalette++;
    continue;
  }

  // For each fill, find its min distance to ANY seed colour. We care about
  // the closest match across all fills — if even one fill is on-brand,
  // the logo is probably fine.
  let bestDistance = Infinity;
  for (const f of fills) {
    for (const e of expected) {
      const d = colorDistance(f, e);
      if (d < bestDistance) bestDistance = d;
    }
  }

  if (bestDistance > DISTANCE_THRESHOLD) {
    suspects.push({
      teamId: team.id,
      name: team.name,
      league: team.league,
      sport: team.sport,
      fills,
      seed: expected,
      minDistance: Math.round(bestDistance),
      reason: `nearest fill is ${Math.round(bestDistance)} RGB-units from the closest seed colour`,
    });
  }
}

if (wantJson) {
  console.log(JSON.stringify({ stats, suspects }, null, 2));
} else {
  console.log(
    `Checked ${stats.checked} primaries · ${stats.monochromeLogo} monochrome SVG (skipped) · ${stats.monochromePalette} monochrome palette (skipped).`,
  );
  console.log();
  console.log(`Suspicious teams: ${suspects.length}\n`);
  for (const s of suspects) {
    console.log(`  ${s.teamId.padEnd(28)} ${s.name}  (${s.league})`);
    console.log(`    fills : ${s.fills.join(', ')}`);
    console.log(`    seed  : ${s.seed.join(', ')}`);
    console.log(`    min RGB distance: ${s.minDistance}`);
    console.log();
  }
}
