// Refresh: walk the seed catalogue, fetch primary + variant logos for each
// team via Wikipedia, generate mono variants, and write everything to the
// cache. Throttle each Wikipedia API call to ~250ms (their etiquette ask).
//
// Usage:
//   npm run refresh                 # all teams
//   npm run refresh -- only=cfb-*   # glob filter (substring match)
//   npm run refresh -- skip-existing # don't re-fetch teams that already
//                                   # have a primary svg on disk

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAMS } from './teams.ts';
import { setTeams } from './cache.ts';
import { fetchTeamLogos, type LogoResult } from './scrapers/index.ts';
import type { Team } from './types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.resolve(__dirname, '../data/logos');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const skipExisting = args.includes('skip-existing');
const onlyIncomplete = args.includes('only-incomplete');
const onlyArg = args.find((a) => a.startsWith('only='));
const onlyFilter = onlyArg ? onlyArg.slice(5) : null;

let targets = TEAMS.filter((t) => !onlyFilter || t.id.includes(onlyFilter));

if (onlyIncomplete) {
  const { getTeams } = await import('./cache.ts');
  const current = await getTeams();
  const byId = new Map(current.map((t) => [t.id, t]));
  // "Incomplete" = fewer than 3 variants, OR missing the mono pair.
  targets = targets.filter((t) => {
    const logos = byId.get(t.id)?.logos ?? [];
    if (logos.length < 3) return true;
    const hasMono = logos.some((l) => l.kind === 'monochrome');
    return !hasMono;
  });
  console.log(`Filtered to ${targets.length} incomplete teams.`);
}

const results: LogoResult[] = [];
const final: Team[] = [];

let i = 0;
for (const team of targets) {
  i++;
  const primaryPath = path.join(LOGO_DIR, `${team.id}.svg`);

  if (skipExisting && existsSync(primaryPath)) {
    process.stdout.write(`[${i}/${targets.length}] ${team.league} — ${team.name} … cached\n`);
    continue;
  }

  process.stdout.write(`[${i}/${targets.length}] ${team.league} — ${team.name} … `);
  const r = await fetchTeamLogos(team);
  results.push(r);
  console.log(`${r.status} (${r.variants.length})`);
  final.push({ ...team, logos: r.variants });
  await sleep(250);
}

// If we filtered, merge with the existing cache so we don't drop everyone else.
if (onlyFilter || skipExisting || onlyIncomplete) {
  const { getTeams } = await import('./cache.ts');
  const existing = await getTeams();
  const updatedById = new Map(final.map((t) => [t.id, t]));
  const merged = existing.map((t) => updatedById.get(t.id) ?? t);
  // Plus any newly-seen teams (shouldn't happen but be safe).
  for (const t of final) if (!existing.find((e) => e.id === t.id)) merged.push(t);
  await setTeams(merged);
} else {
  await setTeams(final);
}

const okCount = results.filter((r) => r.status === 'ok').length;
const noSvgCount = results.filter((r) => r.status === 'no-svg').length;
const errCount = results.filter((r) => r.status === 'error').length;
const totalVariants = results.reduce((n, r) => n + r.variants.length, 0);

console.log();
console.log('=== refresh summary ===');
console.log(`  teams processed: ${results.length}`);
console.log(`  ok             : ${okCount}`);
console.log(`  no-svg         : ${noSvgCount}`);
console.log(`  error          : ${errCount}`);
console.log(`  total variants : ${totalVariants}`);
console.log();

if (errCount > 0) {
  console.log('errors:');
  for (const r of results.filter((x) => x.status === 'error')) {
    console.log(`  - ${r.teamId}: ${r.error}`);
  }
}
