// One-shot ingest of user-provided logo packs (unzipped under
// /tmp/sl-assets/). Maps each pack file to a team in our seed catalogue by
// slugified name match, then copies the SVG into data/logos/ with a
// `__pack-<kind>` suffix so the seed-from-disk fallback picks it up.
//
// Run with:  tsx src/scripts/ingest-packs.ts
//
// After running, delete data/cache.json so the server re-enumerates from
// disk and the new variants appear.

import { copyFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAMS } from '../teams.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.resolve(__dirname, '../../data/logos');
const PACK_ROOT = '/tmp/sl-assets';

await mkdir(LOGO_DIR, { recursive: true });

type Pack = {
  dir: string;
  sport: string;
  variantKind: 'pack-primary' | 'pack-mono';
  // Extra hint for fuzzy matching: only consider these teams. Most packs
  // are sport-restricted but for CFB the file names sometimes drop the
  // mascot, so we may need a broader match.
};

const PACKS: Pack[] = [
  {
    dir: 'ncaa_top20_logos/ncaa_top20_logos',
    sport: 'college-football',
    variantKind: 'pack-primary',
  },
  {
    dir: 'nfl_single_color_logos/nfl_single_color_logos',
    sport: 'american-football',
    variantKind: 'pack-mono',
  },
  {
    dir: 'nba_logos/nba_logos',
    sport: 'basketball',
    variantKind: 'pack-primary',
  },
  {
    dir: 'mlb_single_color_logos/mlb_single_color_logos',
    sport: 'baseball',
    variantKind: 'pack-mono',
  },
];

function slugForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

type Matched = { file: string; teamId: string; dest: string };
type Unmatched = { file: string; pack: string };
const matched: Matched[] = [];
const unmatched: Unmatched[] = [];

for (const pack of PACKS) {
  const dirPath = path.join(PACK_ROOT, pack.dir);
  if (!existsSync(dirPath)) {
    console.warn(`[skip] pack dir not found: ${dirPath}`);
    continue;
  }
  const files = (await readdir(dirPath)).filter((f) => f.toLowerCase().endsWith('.svg'));
  const eligibleTeams = TEAMS.filter((t) => t.sport === pack.sport);
  const byName = new Map(eligibleTeams.map((t) => [slugForMatch(t.name), t]));

  for (const f of files) {
    const slug = slugForMatch(f.replace(/\.svg$/i, ''));
    let team = byName.get(slug);
    // Loosen the match — sometimes pack filenames drop the mascot
    // ("alabama" instead of "alabama_crimson_tide") or vice versa.
    if (!team) {
      team = eligibleTeams.find(
        (t) =>
          slugForMatch(t.name).includes(slug) || slug.includes(slugForMatch(t.name)),
      );
    }
    if (!team) {
      unmatched.push({ file: f, pack: pack.dir });
      continue;
    }
    const dest = path.join(LOGO_DIR, `${team.id}__${pack.variantKind}.svg`);
    await copyFile(path.join(dirPath, f), dest);
    matched.push({ file: f, teamId: team.id, dest });
  }
}

console.log();
console.log(`=== ingest summary ===`);
console.log(`  matched   : ${matched.length}`);
console.log(`  unmatched : ${unmatched.length}`);
if (unmatched.length > 0) {
  console.log();
  console.log('Unmatched files (need a manual mapping or aren\'t in our seed):');
  for (const u of unmatched) console.log(`  - ${u.pack}/${u.file}`);
}
console.log();
console.log('Run `rm server/data/cache.json && touch server/src/index.ts` to force the server to rebuild its team list from the new files.');
