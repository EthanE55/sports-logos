// Logo scraper. Walks the team's Wikipedia article, finds every SVG that
// could plausibly be a logo for the team, classifies each by kind
// (primary, wordmark, alternate, heritage, helmet, monochrome), downloads
// the top ~8 of them, and additionally generates two mono variants
// (mono-black, mono-white) by stripping the primary's fills.
//
// Naming convention on disk:
//   {teamId}.svg             — primary (back-compat with earlier refresh)
//   {teamId}__{variantId}.svg — all other variants
//
// variantId is a kebab-case slug derived from the file title with the
// kind prefixed (e.g. `wordmark-1`, `heritage-1979`, `mono-black`).

import { fetch } from 'undici';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LogoVariant, SeedTeam } from '../types.ts';
import { UA } from '../utils.ts';
import { convertToMono, shouldGenerateMono } from '../mono.ts';
import { unlink } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.resolve(__dirname, '../../data/logos');

const API = 'https://en.wikipedia.org/w/api.php';

type ImageRef = { title: string };

async function api<T>(params: Record<string, string>): Promise<T> {
  const search = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const url = `${API}?${search.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`wiki api ${res.status} for ${params.titles || params.action}`);
  return (await res.json()) as T;
}

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'fan', 'fans', 'team', 'club']);

// Anything in PENALTY_RX is auto-rejected — these files are diagrams, kit
// schematics, stadium maps, conference graphics, etc., not logos.
//
// `logo in .* colors` matches Wikipedia's conference-placeholder naming
// (e.g. "SEC logo in Arkansas colors.svg") — these are used on team pages
// when the school's actual logo is non-free and unavailable. They share
// the team's tokens AND the "logo" keyword, so without this guard they
// score as the team's primary.
const PENALTY_RX =
  /(kit|jersey|uniform|stadium|map|location|league|division|conference|number|chart|graph|flag|country|football_pitch|pitch|territory|realignment|seal_of_the|coat_of_arms|\blogo\s+in\s+[a-z' &-]+\s+colors\b)/i;

// CLASSIFIERS — order matters, first match wins. Each returns a "kind"
// plus a base score; higher score = preferred for primary slot.
type Classification = {
  kind: LogoVariant['kind'];
  baseScore: number;
  variantSlug: string;   // distinctive part of the variantId
  label: string;
};

function classify(fileTitleSlug: string): Classification | null {
  const s = fileTitleSlug;

  if (PENALTY_RX.test(s)) return null;

  if (/wordmark|word.?mark|logotype/i.test(s)) {
    return { kind: 'wordmark', baseScore: 7, variantSlug: 'wordmark', label: 'Wordmark' };
  }
  if (/helmet/i.test(s)) {
    return { kind: 'helmet', baseScore: 4, variantSlug: 'helmet', label: 'Helmet' };
  }
  // Heritage signals — explicit words OR a 19xx / early-20xx year embedded.
  // The year heuristic avoids matching current-day "2024 logo" — only if the
  // year is in the past *and* the file looks historic (under 2010 or with
  // explicit retro words).
  if (/throwback|heritage|vintage|historic(?:al)?|retro|original/i.test(s)) {
    return { kind: 'heritage', baseScore: 4, variantSlug: 'heritage', label: 'Heritage' };
  }
  const yr = s.match(/\b(19\d{2}|200\d)\b/);
  if (yr) {
    return {
      kind: 'heritage',
      baseScore: 3,
      variantSlug: `heritage-${yr[1]}`,
      label: `Heritage (${yr[1]})`,
    };
  }
  if (/secondary|alternate|\balt(?!a)\b/i.test(s)) {
    return { kind: 'alternate', baseScore: 4, variantSlug: 'alternate', label: 'Alternate' };
  }
  // Single-colour variants already on Wikipedia (rare for sports teams but
  // a few clubs publish them).
  if (/(monochrome|mono(?:-|_)|\b1[- ]color|black[- ]?and[- ]?white)/i.test(s)) {
    return { kind: 'monochrome', baseScore: 2, variantSlug: 'mono-wiki', label: 'Monochrome' };
  }
  // Primary signals — explicit logo/crest/badge/emblem tokens.
  if (/\b(logo|crest|badge|emblem|primary)\b/i.test(s)) {
    return { kind: 'primary', baseScore: 10, variantSlug: 'primary', label: 'Primary' };
  }
  // Fallback: a plain SVG that mentions the team gets a low-priority alt slot.
  return { kind: 'alternate', baseScore: 1, variantSlug: 'variant', label: 'Variant' };
}

function slugify(s: string, max = 24): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

async function listImages(articleTitle: string): Promise<ImageRef[]> {
  type Resp = { query?: { pages?: Array<{ images?: ImageRef[] }> } };
  const data = await api<Resp>({
    action: 'query',
    titles: articleTitle,
    prop: 'images',
    imlimit: '200',
    redirects: '1',
  });
  return data.query?.pages?.[0]?.images ?? [];
}

// Many schools/teams keep their primary logo on the athletics article
// (e.g. "Maryland Terrapins") rather than the football article
// (e.g. "Maryland Terrapins football") that we point at by default.
// Derive the parent title by stripping the sport suffix.
function parentArticleTitle(footballTitle: string): string | null {
  const stripped = footballTitle.replace(/\s+football$/i, '');
  if (stripped === footballTitle) return null;
  return stripped;
}

async function resolveImageUrls(fileTitles: string[]): Promise<Map<string, string>> {
  // batch-resolve up to 50 file titles per request
  const out = new Map<string, string>();
  for (let i = 0; i < fileTitles.length; i += 50) {
    const chunk = fileTitles.slice(i, i + 50);
    type Resp = {
      query?: {
        pages?: Array<{ title?: string; imageinfo?: Array<{ url: string }> }>;
      };
    };
    const data = await api<Resp>({
      action: 'query',
      titles: chunk.join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
    });
    for (const page of data.query?.pages ?? []) {
      const url = page.imageinfo?.[0]?.url;
      if (page.title && url) out.set(page.title, url);
    }
  }
  return out;
}

async function downloadSvg(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

// Post-download sanity checks. Some Wikipedia files pass the filename
// classifier (they mention the team and have "logo"/"crest" in title) but
// their actual SVG content is wrong: the Wikimedia Commons placeholder
// embedded in many articles, a city coat-of-arms shared with the football
// club's name, or another sports-club's mark that happens to live in the
// same Wikipedia category. We validate two things here:
//
//   1. Content blocklist — the Commons-logo SVG has a distinctive title
//      element so we can recognise it regardless of upload name.
//   2. Palette match — every team has a curated colour seed, and a real
//      team logo virtually always uses at least one of those colours.
//      If the downloaded SVG contains no fill within ~95 RGB-units of any
//      seed colour, it's almost certainly the wrong file.
//
// On rejection we delete the downloaded file and pretend it was never
// found. Caller treats the candidate as if `imageinfo` returned nothing.

const NEUTRAL_FILLS = new Set(['#000000', '#ffffff', '#000', '#fff']);
const PALETTE_DISTANCE_THRESHOLD = 95;

function isContentBlocklisted(svg: string): string | null {
  if (/<title>\s*Wikimedia Commons Logo\s*<\/title>/i.test(svg)) {
    return 'wikimedia-commons-placeholder';
  }
  return null;
}

function normaliseHex(c: string): string {
  let s = c.toLowerCase();
  if (s === 'black') return '#000000';
  if (s === 'white') return '#ffffff';
  if (s.startsWith('#') && s.length === 4) {
    s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  return s;
}

function hex2rgb(c: string): [number, number, number] {
  const s = normaliseHex(c).slice(1);
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

function extractContentFills(svg: string): string[] {
  const set = new Set<string>();
  for (const m of svg.matchAll(
    /(?:fill="|fill:\s*|stop-color="|stop-color:\s*)(#[0-9A-Fa-f]{3,8}|[a-zA-Z]+)/g,
  )) {
    const c = normaliseHex(m[1]);
    if (c === 'none' || c === 'transparent') continue;
    if (NEUTRAL_FILLS.has(c)) continue;
    set.add(c);
  }
  return [...set];
}

function matchesTeamPalette(svg: string, seedColors: string[]): boolean {
  const fills = extractContentFills(svg);
  if (fills.length === 0) return true; // monochrome SVG — colour check is meaningless
  const seeds = seedColors.map(normaliseHex).filter((c) => !NEUTRAL_FILLS.has(c));
  if (seeds.length === 0) return true; // team palette is just black/white
  for (const f of fills) {
    for (const s of seeds) {
      if (colorDistance(f, s) <= PALETTE_DISTANCE_THRESHOLD) return true;
    }
  }
  return false;
}

async function validateAndReject(
  destPath: string,
  team: SeedTeam,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let svg: string;
  try {
    const buf = await (await import('node:fs/promises')).readFile(destPath);
    svg = buf.toString('utf8');
  } catch {
    return { ok: false, reason: 'read-failed' };
  }
  const blocklist = isContentBlocklisted(svg);
  if (blocklist) {
    await unlink(destPath).catch(() => {});
    return { ok: false, reason: blocklist };
  }
  if (!matchesTeamPalette(svg, team.colors)) {
    await unlink(destPath).catch(() => {});
    return { ok: false, reason: 'palette-mismatch' };
  }
  return { ok: true };
}

type Candidate = {
  fileTitle: string;
  kind: LogoVariant['kind'];
  variantSlug: string;
  label: string;
  score: number;
};

// Pick the best ~8 candidates: at most 1 primary, then up to N each of the
// other kinds, all gated by team-token match.
function pickCandidates(team: SeedTeam, images: ImageRef[]): Candidate[] {
  const teamTokens = tokenise(team.name);
  const candidates: Candidate[] = [];

  for (const img of images) {
    if (!/\.svg$/i.test(img.title)) continue;
    const base = img.title.replace(/^File:/, '').replace(/\.svg$/i, '');
    const lowered = base.toLowerCase();

    // Must mention the team somewhere — without this, generic "AFC.svg" or
    // "Sport.svg" files attached to the article would land in our results.
    let teamMatches = 0;
    for (const t of teamTokens) if (lowered.includes(t)) teamMatches++;
    if (teamMatches === 0) continue;

    const c = classify(lowered);
    if (!c) continue;

    candidates.push({
      fileTitle: img.title,
      kind: c.kind,
      variantSlug: c.variantSlug,
      label: c.label,
      // Boost score by team-token match count and lightly penalise long names
      // (which tend to be variation files like "Logo with banner 2017.svg").
      score: c.baseScore + teamMatches * 5 - base.length * 0.01,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // De-dupe by kind. Allow multiple alternates / heritage / helmets, but
  // only one primary and one wordmark.
  const out: Candidate[] = [];
  const seenKinds = new Map<string, number>();
  const SINGLE_KINDS = new Set<LogoVariant['kind']>(['primary', 'wordmark']);
  const MAX_PER_KIND: Record<LogoVariant['kind'], number> = {
    primary: 1,
    wordmark: 2,
    helmet: 2,
    alternate: 3,
    heritage: 3,
    monochrome: 1,
  };

  for (const c of candidates) {
    const taken = seenKinds.get(c.kind) ?? 0;
    if (SINGLE_KINDS.has(c.kind) && taken >= 1) continue;
    if (taken >= MAX_PER_KIND[c.kind]) continue;
    seenKinds.set(c.kind, taken + 1);
    out.push(c);
    if (out.length >= 8) break;
  }

  return out;
}

export type LogoResult = {
  teamId: string;
  status: 'ok' | 'no-svg' | 'error';
  variants: LogoVariant[];
  error?: string;
};

export async function fetchTeamLogos(team: SeedTeam): Promise<LogoResult> {
  try {
    // Query the team's football article AND the parent athletics article
    // (if any). Many universities keep their primary athletics mark on
    // the school-level article, not the sport-specific one.
    const parent = parentArticleTitle(team.wikipediaTitle);
    const imageLists = await Promise.all([
      listImages(team.wikipediaTitle),
      parent ? listImages(parent) : Promise.resolve([] as ImageRef[]),
    ]);
    const seen = new Set<string>();
    const images: ImageRef[] = [];
    for (const list of imageLists) {
      for (const img of list) {
        if (seen.has(img.title)) continue;
        seen.add(img.title);
        images.push(img);
      }
    }
    const candidates = pickCandidates(team, images);
    if (candidates.length === 0) {
      return { teamId: team.id, status: 'no-svg', variants: [] };
    }

    const urls = await resolveImageUrls(candidates.map((c) => c.fileTitle));

    const variants: LogoVariant[] = [];
    // Track which slugs we've used so two heritage files don't both land
    // as `__heritage.svg`.
    const usedIds = new Set<string>();

    for (const c of candidates) {
      const url = urls.get(c.fileTitle);
      if (!url) continue;

      const isPrimary = c.kind === 'primary';
      let variantId: string;
      let fileName: string;
      if (isPrimary && !usedIds.has('primary')) {
        variantId = 'primary';
        fileName = `${team.id}.svg`;
      } else {
        // Add a numeric suffix to distinguish multiple variants of the same kind.
        const baseSlug = c.variantSlug;
        let candidateId = baseSlug;
        let n = 2;
        while (usedIds.has(candidateId)) {
          candidateId = `${baseSlug}-${n++}`;
        }
        variantId = candidateId;
        fileName = `${team.id}__${variantId}.svg`;
      }
      usedIds.add(variantId);

      const destPath = path.join(LOGO_DIR, fileName);
      try {
        await downloadSvg(url, destPath);
      } catch {
        continue;
      }
      // Content-level guard: reject the Wikimedia Commons placeholder and
      // any file whose palette is nowhere near the team's seed colours.
      // Only apply this guard to the PRIMARY slot — alternates, wordmarks,
      // and heritage marks legitimately use a wider palette.
      if (c.kind === 'primary') {
        const v = await validateAndReject(destPath, team);
        if (!v.ok) continue;
      }
      variants.push({
        variantId,
        kind: c.kind,
        label: c.label,
        fileName,
        sourceUrl: url,
      });
    }

    // Generate mono variants. Prefer the primary variant; fall back to the
    // highest-scoring variant (first in the list) so teams whose only
    // Wikipedia logo is a wordmark still get mono versions.
    //
    // Skip the generation entirely when the source logo mixes dark and
    // light form elements (Missouri's gold tiger inside a black oval is
    // the canonical case). The auto-mono would collapse into a useless
    // black blob — the user-supplied pack-mono variant is the right
    // answer for those teams instead.
    const monoSource = variants.find((v) => v.variantId === 'primary') ?? variants[0];
    if (monoSource) {
      const primaryPath = path.join(LOGO_DIR, monoSource.fileName);
      try {
        const svg = await readFile(primaryPath, 'utf8');
        if (shouldGenerateMono(svg)) {
          for (const [tone, hex, label] of [
            ['mono-black', '#000000', 'Mono Black'],
            ['mono-white', '#FFFFFF', 'Mono White'],
          ] as const) {
            if (usedIds.has(tone)) continue;
            const monoSvg = convertToMono(svg, hex);
            const fileName = `${team.id}__${tone}.svg`;
            await writeFile(path.join(LOGO_DIR, fileName), monoSvg);
            variants.push({
              variantId: tone,
              kind: 'monochrome',
              label,
              fileName,
              sourceUrl: null,
            });
            usedIds.add(tone);
          }
        }
      } catch {
        // mono gen is best-effort; if the primary file can't be read,
        // skip silently.
      }
    }

    if (variants.length === 0) {
      return { teamId: team.id, status: 'no-svg', variants: [] };
    }
    return { teamId: team.id, status: 'ok', variants };
  } catch (err) {
    return {
      teamId: team.id,
      status: 'error',
      variants: [],
      error: (err as Error).message,
    };
  }
}
