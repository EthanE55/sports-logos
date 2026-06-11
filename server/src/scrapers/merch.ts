// Fetches team photographs ("merch" — players in uniform, fans in the
// crowd, stadium imagery) from Wikimedia. We can't legitimately pull Nike
// brand-ad creative (copyrighted, behind their CDN), so this pulls the
// closest free-licensed alternative: Wikimedia files showing fans/crowds/
// games/stadiums alongside player photos.
//
// Three sources are merged:
//
// 1. Images on the team's Wikipedia article — what editors chose to embed.
//
// 2. Wikimedia Commons category members — anything filed under
//    `Category:<Team Name>` or `Category:<Wikipedia title>`. Big teams
//    have hundreds of files here, often including game-day crowd shots.
//
// 3. Commons file-namespace search — `<Team> fans` and `<Team> stadium`
//    surface fan-in-the-crowd content the categories miss. This is the
//    main source of crowd photography.
//
// Each file is scored with a fan/crowd/stadium bias so those rank above
// generic logo PNGs.

import { fetch } from 'undici';
import type { SeedTeam } from '../types.ts';
import { UA } from '../utils.ts';

const EN_API = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

const PHOTO_EXT_RX = /\.(jpe?g|png|webp)$/i;

// Strong rejects — these never look like real merch/fan content.
const REJECT_RX =
  /(logo|wordmark|seal_of|emblem|crest|\bmap\b|affiliate|schedule|chart|depth_chart|roster|signature|autograph|graph_of|graph\.|coa\b|coat_of_arms|territory|conference_realignment|division_realignment|standings|playoff_bracket|wikidata|template)/i;

// Strong positives — files that almost certainly show fan/crowd/stadium content.
const FAN_RX =
  /(fans?|crowd|stadium|tailgate|cheer|gameday|game[-_ ]day|supporters?|spectators?)/i;

// Medium positives — game/action photos (jerseys visible, often crowds in bg).
const ACTION_RX =
  /(game|match|vs\b|versus|playoff|bowl|series|championship|world[-_ ]series|super[-_ ]bowl|home[-_ ]opener|kickoff|pitch|huddle|touchdown|home[-_ ]run|warm[-_ ]up)/i;

// Uniform diagrams — useful merch ref even though they're schematic SVGs
// rendered as PNG. Mild positive.
const UNIFORM_RX = /uniform/i;

type ImageRef = { title: string };

async function callApi(host: string, params: Record<string, string>): Promise<unknown> {
  const search = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const res = await fetch(`${host}?${search.toString()}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  return await res.json();
}

async function imagesOnArticle(articleTitle: string): Promise<string[]> {
  type Resp = { query?: { pages?: Array<{ images?: ImageRef[] }> } };
  const data = (await callApi(EN_API, {
    action: 'query',
    titles: articleTitle,
    prop: 'images',
    imlimit: '200',
    redirects: '1',
  })) as Resp;
  return (data.query?.pages?.[0]?.images ?? []).map((i) => i.title);
}

async function categoryMembers(host: string, categoryTitle: string): Promise<string[]> {
  type Resp = { query?: { categorymembers?: Array<{ title: string }> } };
  const data = (await callApi(host, {
    action: 'query',
    list: 'categorymembers',
    cmtitle: categoryTitle,
    cmtype: 'file',
    cmlimit: '50',
  })) as Resp;
  return (data.query?.categorymembers ?? []).map((m) => m.title);
}

// Search Commons file namespace (ns=6) for free-text terms — finds files
// even when their host category doesn't match a name we'd guess.
async function searchCommonsFiles(query: string, limit = 25): Promise<string[]> {
  type Resp = { query?: { search?: Array<{ title: string }> } };
  const data = (await callApi(COMMONS_API, {
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '6',
    srlimit: String(limit),
  })) as Resp;
  return (data.query?.search ?? []).map((s) => s.title);
}

export type MerchPhoto = {
  title: string;
  thumbUrl: string;
  url: string;
  width: number;
  height: number;
  descriptionUrl: string;
};

async function resolveImageInfo(
  host: string,
  fileTitles: string[],
): Promise<Map<string, MerchPhoto>> {
  const out = new Map<string, MerchPhoto>();
  if (fileTitles.length === 0) return out;
  for (let i = 0; i < fileTitles.length; i += 50) {
    const chunk = fileTitles.slice(i, i + 50);
    type Resp = {
      query?: {
        pages?: Array<{
          title?: string;
          imageinfo?: Array<{
            url: string;
            thumburl?: string;
            thumbwidth?: number;
            thumbheight?: number;
            width: number;
            height: number;
            descriptionurl: string;
          }>;
        }>;
      };
    };
    const data = (await callApi(host, {
      action: 'query',
      titles: chunk.join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size',
      iiurlwidth: '800',
    })) as Resp;
    for (const page of data.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      if (!info || !page.title) continue;
      out.set(page.title, {
        title: page.title,
        url: info.url,
        thumbUrl: info.thumburl ?? info.url,
        width: info.thumbwidth ?? info.width,
        height: info.thumbheight ?? info.height,
        descriptionUrl: info.descriptionurl,
      });
    }
  }
  return out;
}

function scorePhoto(title: string, teamTokens: Set<string>): number {
  const base = title.replace(/^File:/, '').toLowerCase();
  if (REJECT_RX.test(base)) return -100;

  let score = 0;
  // Team-token presence — needed at all (otherwise unrelated photos slip in).
  let teamMatches = 0;
  for (const t of teamTokens) if (base.includes(t)) teamMatches++;
  if (teamMatches === 0) return -50;
  score += teamMatches * 3;

  if (FAN_RX.test(base)) score += 12;       // crowd / fans / stadium
  if (ACTION_RX.test(base)) score += 6;     // game / match / bowl
  if (UNIFORM_RX.test(base)) score += 3;    // uniform refs are useful for merch

  // Multi-token names tend to be descriptive; single-token are usually camera DSC.
  const wordCount = base.replace(/[^a-z]+/g, ' ').trim().split(/\s+/).length;
  if (wordCount >= 3) score += 2;
  if (wordCount === 1) score -= 5;

  return score;
}

const cache = new Map<string, { at: number; photos: MerchPhoto[] }>();
const TTL_MS = 1000 * 60 * 60 * 6;

export async function fetchMerchPhotos(team: SeedTeam): Promise<MerchPhoto[]> {
  const cached = cache.get(team.id);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.photos;

  // 1) Article images
  const articlePromise = imagesOnArticle(team.wikipediaTitle).catch(() => [] as string[]);

  // 2) Commons categories — try the team name and the football-specific title.
  const categoryPromises = [
    categoryMembers(COMMONS_API, `Category:${team.name}`).catch(() => [] as string[]),
    categoryMembers(COMMONS_API, `Category:${team.wikipediaTitle}`).catch(() => [] as string[]),
  ];

  // 3) Targeted Commons search — pull fan/crowd/stadium content directly.
  const searchPromises = [
    searchCommonsFiles(`"${team.name}" fans`).catch(() => [] as string[]),
    searchCommonsFiles(`"${team.name}" crowd`).catch(() => [] as string[]),
    searchCommonsFiles(`"${team.name}" stadium`).catch(() => [] as string[]),
  ];

  const [
    articleTitles,
    catA,
    catB,
    searchFans,
    searchCrowd,
    searchStadium,
  ] = await Promise.all([articlePromise, ...categoryPromises, ...searchPromises]);

  const all = new Set<string>([
    ...articleTitles,
    ...catA,
    ...catB,
    ...searchFans,
    ...searchCrowd,
    ...searchStadium,
  ]);

  // Keep raster photos only.
  const photos = [...all].filter((t) => PHOTO_EXT_RX.test(t));
  if (photos.length === 0) {
    cache.set(team.id, { at: Date.now(), photos: [] });
    return [];
  }

  const teamTokens = new Set(
    team.name
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
  const scored = photos
    .map((t) => ({ title: t, score: scorePhoto(t, teamTokens) }))
    .filter((p) => p.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 24); // resolve more than needed — some may not have thumbnails

  const titles = scored.map((s) => s.title);
  const commonsInfo = await resolveImageInfo(COMMONS_API, titles).catch(() => new Map());
  const missing = titles.filter((t) => !commonsInfo.has(t));
  const enInfo = missing.length
    ? await resolveImageInfo(EN_API, missing).catch(() => new Map())
    : new Map();

  const resolved: MerchPhoto[] = [];
  for (const { title } of scored) {
    const info = commonsInfo.get(title) ?? enInfo.get(title);
    if (!info) continue;
    // Filter tiny images — likely thumbnails of icons rather than real photos.
    if (info.width < 240 || info.height < 180) continue;
    resolved.push(info);
    if (resolved.length >= 16) break;
  }

  cache.set(team.id, { at: Date.now(), photos: resolved });
  return resolved;
}
