// Computes the dominant ordering of each team's seed colour palette by
// counting how many pixels in the primary logo are closest to each seed
// colour. Output is written to data/dominant-colors.json as
//   { [teamId]: ["#color1", "#color2", ...] }
//
// The cache layer reads this file and overrides the seed-declared order
// so the /api/teams response always has the most prominent brand colour
// first, exactly what the per-league palette export button copies.

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { TEAMS } from '../teams.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.resolve(__dirname, '../../data/logos');
const OUT_PATH = path.resolve(__dirname, '../../data/dominant-colors.json');

const SAMPLE_WIDTH = 240;
// Pixels within this RGB distance of a seed colour count toward that
// colour's tally. Anything further (likely an outline or accent not in
// the team's palette) is ignored — we're ranking THE SEED colours, not
// inventing new ones.
const MATCH_THRESHOLD = 60;

type RGB = [number, number, number];

function hex2rgb(hex: string): RGB {
  const c = hex.replace('#', '');
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

function distSq(a: RGB, b: RGB): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

async function dominantOrder(
  filePath: string,
  seedColors: string[],
): Promise<string[]> {
  const buf = await readFile(filePath);
  const isPng = filePath.toLowerCase().endsWith('.png');

  // Render to a small raster. density=150 is enough resolution for
  // colour-counting without making sharp do unnecessary work.
  const { data, info } = await sharp(buf, isPng ? undefined : { density: 150 })
    .resize({
      width: SAMPLE_WIDTH,
      height: SAMPLE_WIDTH,
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const seedRgbs = seedColors.map(hex2rgb);
  const thresholdSq = MATCH_THRESHOLD * MATCH_THRESHOLD;
  const counts = new Array(seedColors.length).fill(0);

  // Each pixel is 4 bytes (RGBA).
  for (let i = 0; i < data.length; i += info.channels) {
    if (info.channels === 4 && data[i + 3] < 128) continue; // transparent
    const px: RGB = [data[i], data[i + 1], data[i + 2]];
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let s = 0; s < seedRgbs.length; s++) {
      const d = distSq(px, seedRgbs[s]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = s;
      }
    }
    if (bestIdx >= 0 && bestDist <= thresholdSq) counts[bestIdx]++;
  }

  // Sort the original seed list by count descending. Ties keep the seed
  // order (stable sort) — this makes the output deterministic.
  return seedColors
    .map((c, i) => ({ c, count: counts[i], originalIndex: i }))
    .sort((a, b) => b.count - a.count || a.originalIndex - b.originalIndex)
    .map((x) => x.c);
}

const result: Record<string, string[]> = {};
let processed = 0;
let skipped = 0;

for (const team of TEAMS) {
  // Try SVG first then PNG (Arkansas-style fallback).
  let filePath = path.join(LOGO_DIR, `${team.id}.svg`);
  if (!existsSync(filePath)) filePath = path.join(LOGO_DIR, `${team.id}.png`);
  if (!existsSync(filePath)) {
    skipped++;
    continue;
  }
  try {
    const ordered = await dominantOrder(filePath, team.colors);
    if (ordered.join('|') !== team.colors.join('|')) {
      result[team.id] = ordered;
    }
    processed++;
    if (processed % 50 === 0) {
      console.log(`  ${processed}/${TEAMS.length} processed…`);
    }
  } catch (err) {
    console.warn(`  ${team.id}: ${(err as Error).message}`);
    skipped++;
  }
}

await writeFile(OUT_PATH, JSON.stringify(result, null, 2));
console.log();
console.log(`Processed   : ${processed}`);
console.log(`Skipped     : ${skipped}`);
console.log(`Reordered   : ${Object.keys(result).length}`);
console.log(`Wrote       : ${OUT_PATH}`);
