import { JSONFilePreset } from 'lowdb/node';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { CacheShape, LogoVariant, Team } from './types.ts';
import { TEAMS } from './teams.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cachePath = path.resolve(__dirname, '../data/cache.json');
const LOGO_DIR = path.resolve(__dirname, '../data/logos');
const DOMINANT_COLORS_PATH = path.resolve(__dirname, '../data/dominant-colors.json');

// Dominant-color ordering, populated by the
// `compute-dominant-colors` script. The map is keyed by team id and
// contains the team's seed `colors` array re-ordered so the colour with
// the most pixels in its primary logo comes first.
const dominantOverrides: Record<string, string[]> = (() => {
  if (!existsSync(DOMINANT_COLORS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DOMINANT_COLORS_PATH, 'utf8'));
  } catch {
    return {};
  }
})();

function applyDominantOrder(team: { id: string; colors: string[] }): string[] {
  const override = dominantOverrides[team.id];
  if (!override || override.length === 0) return team.colors;
  // Defensive sanity-check: the override must be a permutation of the
  // seed colours. If it's stale (added/removed a colour from the seed
  // and didn't re-run compute), fall back to the seed order.
  if (override.length !== team.colors.length) return team.colors;
  for (const c of override) {
    if (!team.colors.includes(c)) return team.colors;
  }
  return override;
}

const defaultData: CacheShape = { updatedAt: null, teams: [] };

const dbPromise = JSONFilePreset<CacheShape>(cachePath, defaultData);

// Fallback used while the cache.json hasn't been written yet (very first
// `npm run dev` after a clean clone). Each team's logos[] is reconstructed
// by enumerating files in data/logos/ that match the team id prefix and
// inferring `kind` from the variant suffix.
const KIND_FROM_SUFFIX: Record<string, LogoVariant['kind']> = {
  primary: 'primary',
  wordmark: 'wordmark',
  alternate: 'alternate',
  heritage: 'heritage',
  helmet: 'helmet',
  'mono-black': 'monochrome',
  'mono-white': 'monochrome',
  'mono-wiki': 'monochrome',
  'pack-primary': 'alternate',  // user-supplied brand pack — show as an alternate
  'pack-mono': 'monochrome',    // user-supplied single-color variant
  variant: 'alternate',
};

function inferKind(variantId: string): LogoVariant['kind'] {
  // Strip trailing -<digits> (e.g. heritage-1979, alternate-2)
  const stripped = variantId.replace(/-\d+$/, '');
  return KIND_FROM_SUFFIX[stripped] ?? KIND_FROM_SUFFIX[variantId] ?? 'alternate';
}

function inferLabel(variantId: string, kind: LogoVariant['kind']): string {
  if (variantId === 'primary') return 'Primary';
  if (variantId === 'mono-black') return 'Mono Black';
  if (variantId === 'mono-white') return 'Mono White';
  if (variantId === 'pack-primary') return 'Brand Pack';
  if (variantId === 'pack-mono') return 'Single-Color';
  if (kind === 'wordmark') return 'Wordmark';
  if (kind === 'helmet') return 'Helmet';
  if (kind === 'monochrome') return 'Monochrome';
  // heritage-1979 → "Heritage (1979)"
  const yr = variantId.match(/^heritage-(\d{4})$/);
  if (yr) return `Heritage (${yr[1]})`;
  if (kind === 'heritage') return 'Heritage';
  return 'Alternate';
}

function seedFromDisk(): Team[] {
  if (!existsSync(LOGO_DIR)) return TEAMS.map((t) => ({ ...t, logos: [] }));
  // Accept .svg AND .png — most logos are SVG but a handful of teams whose
  // mark is non-free (e.g. Arkansas Razorbacks hog) only exist as raster
  // assets on Wikipedia. The serving layer detects format from extension.
  const files = readdirSync(LOGO_DIR).filter(
    (f) => f.endsWith('.svg') || f.endsWith('.png'),
  );
  const byTeam = new Map<string, string[]>();
  for (const f of files) {
    const sepIndex = f.indexOf('__');
    // Strip the 4-char extension (.svg or .png) to get the team id when
    // there's no variant suffix.
    const teamId = sepIndex >= 0 ? f.slice(0, sepIndex) : f.slice(0, -4);
    if (!byTeam.has(teamId)) byTeam.set(teamId, []);
    byTeam.get(teamId)!.push(f);
  }

  return TEAMS.map((t) => {
    const fileList = byTeam.get(t.id) ?? [];
    const logos: LogoVariant[] = [];
    for (const fileName of fileList) {
      const sepIndex = fileName.indexOf('__');
      const variantId = sepIndex >= 0 ? fileName.slice(sepIndex + 2, -4) : 'primary';
      const kind = inferKind(variantId);
      logos.push({
        variantId,
        kind,
        label: inferLabel(variantId, kind),
        fileName,
        sourceUrl: null,
      });
    }
    // Put primary first.
    logos.sort((a, b) =>
      a.variantId === 'primary' ? -1 : b.variantId === 'primary' ? 1 : 0,
    );
    return { ...t, colors: applyDominantOrder(t), logos };
  });
}

export async function getTeams(): Promise<Team[]> {
  const db = await dbPromise;
  await db.read();
  if (db.data.teams.length === 0) return seedFromDisk();
  // Even when the cache.json is canonical, apply the dominant-colour
  // override on read — re-running the compute script shouldn't require
  // a full refresh to take effect.
  return db.data.teams.map((t) => ({ ...t, colors: applyDominantOrder(t) }));
}

export async function setTeams(teams: Team[]): Promise<void> {
  const db = await dbPromise;
  db.data.teams = teams;
  db.data.updatedAt = new Date().toISOString();
  await db.write();
}

export async function getMeta(): Promise<{
  updatedAt: string | null;
  count: number;
  withLogos: number;
  totalVariants: number;
}> {
  const teams = await getTeams();
  return {
    updatedAt: (await dbPromise).data.updatedAt,
    count: teams.length,
    withLogos: teams.filter((t) => t.logos.length > 0).length,
    totalVariants: teams.reduce((n, t) => n + t.logos.length, 0),
  };
}
