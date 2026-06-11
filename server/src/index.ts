import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import sharp from 'sharp';
import archiver from 'archiver';
import { getTeams, getMeta } from './cache.ts';
import { fetchMerchPhotos } from './scrapers/merch.ts';
import { searchWebImages } from './scrapers/webImages.ts';
import { UA } from './utils.ts';
import type { LogoVariant, Team } from './types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.resolve(__dirname, '../data/logos');
// When deployed, the Vite-built static client lives at client/dist
// (next to the server workspace). Locally during `npm run dev` the
// Vite dev server handles this on port 5174 and we never enter the
// production branch, so the missing-dir case is harmless.
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, ...(await getMeta()) });
});

app.get('/api/teams', async (_req, res) => {
  const teams = await getTeams();
  // Strip the absolute filesystem path before sending — clients only need
  // the variantId + label; they fetch bytes via /api/svg/:id/:variant.
  res.json({
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      sport: t.sport,
      league: t.league,
      colors: t.colors,
      wikipediaTitle: t.wikipediaTitle,
      hasLogo: t.logos.length > 0,
      logos: t.logos.map((l) => ({
        variantId: l.variantId,
        kind: l.kind,
        label: l.label,
      })),
    })),
  });
});

app.get('/api/leagues', async (_req, res) => {
  const teams = await getTeams();
  const grouped: Record<string, Record<string, number>> = {};
  for (const t of teams) {
    grouped[t.sport] = grouped[t.sport] ?? {};
    grouped[t.sport][t.league] = (grouped[t.sport][t.league] ?? 0) + 1;
  }
  res.json({ sports: grouped });
});

// Serves the SVG inline. `?download=1` switches to an attachment response
// so the browser saves to disk with a sensible filename.
// Two routes share the same handler:
//   /api/svg/:id              → primary variant (back-compat)
//   /api/svg/:id/:variantId   → specific variant
async function serveSvg(
  req: express.Request<{ id: string; variantId?: string }>,
  res: express.Response,
) {
  const id = req.params.id;
  const variantId = req.params.variantId ?? 'primary';
  if (!/^[a-z0-9-]+$/i.test(id) || !/^[a-z0-9-]+$/i.test(variantId)) {
    return res.status(400).send('bad id');
  }

  const teams = await getTeams();
  const team = teams.find((t) => t.id === id);
  if (!team) return res.status(404).send('team not found');
  // When the bare /api/svg/:id is hit (no explicit variant), prefer the
  // canonical 'primary' but gracefully fall back to the first available
  // logo so teams whose primary was rejected as a wrong-content scrape
  // (e.g. Naples city arms vs. SSC Napoli) can still show their wordmark
  // or alternate on the home-page card instead of breaking the image.
  const explicitVariant = req.params.variantId !== undefined;
  const variant = explicitVariant
    ? team.logos.find((l) => l.variantId === variantId)
    : team.logos.find((l) => l.variantId === 'primary') ?? team.logos[0];
  if (!variant) return res.status(404).send('variant not available');

  const filePath = path.join(LOGO_DIR, variant.fileName);
  if (!filePath.startsWith(LOGO_DIR + path.sep)) {
    return res.status(400).send('bad path');
  }
  try {
    await stat(filePath);
  } catch {
    return res.status(404).send('svg missing on disk');
  }

  // Format is inferred from the file extension — most variants are SVG
  // but a few teams (trademark-protected marks like the Arkansas
  // Razorbacks hog) only exist as PNG on free sources.
  const isPng = variant.fileName.toLowerCase().endsWith('.png');
  const contentType = isPng ? 'image/png' : 'image/svg+xml';
  const extension = isPng ? 'png' : 'svg';

  res.setHeader('Content-Type', contentType);
  // `max-age=0, must-revalidate` keeps the browser cache alive but forces
  // a conditional GET on every load. `sendFile` emits ETag + Last-Modified
  // automatically, so unchanged logos return a tiny 304 — fresh content
  // is never served from an out-of-date cache.
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  if (req.query.download === '1') {
    const suffix = variantId === 'primary' ? '' : `-${variantId}`;
    const filename = `${team.name.replace(/[^a-z0-9]+/gi, '-')}${suffix}.${extension}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(500).end();
  });
}

app.get('/api/svg/:id', serveSvg);
app.get('/api/svg/:id/:variantId', serveSvg);

// Merch photos for a single team — currently enabled for NFL, college
// football, and MLB only (per the brief). Other sports return a 404 so the
// client can decide not to show the merch tab.
const MERCH_SPORTS = new Set(['american-football', 'college-football', 'baseball']);

app.get('/api/merch/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^[a-z0-9-]+$/i.test(id)) return res.status(400).json({ error: 'bad id' });
  const teams = await getTeams();
  const team = teams.find((t) => t.id === id);
  if (!team) return res.status(404).json({ error: 'team not found' });
  if (!MERCH_SPORTS.has(team.sport)) {
    return res.status(404).json({ error: 'merch not enabled for this sport' });
  }
  try {
    // Pull Wikimedia photos (curated, mostly stadium + game action) and
    // DDG image search (broader: fans, merch, news photos). The third
    // DDG query biases toward the pro photo agencies the user asked
    // about (Icon Sportswire, MaxPreps, Second Crop) — those sites are
    // SPA / auth-walled when scraped directly, but DDG indexes them.
    const [wikiPhotos, webFans, webMerch, webPro] = await Promise.all([
      fetchMerchPhotos(team),
      searchWebImages(`${team.name} fans crowd`, 12),
      searchWebImages(`${team.name} jersey merchandise`, 8),
      searchWebImages(
        `${team.name} site:iconsportswire.com OR site:maxpreps.com OR site:secondcropcreative.com`,
        8,
      ),
    ]);

    // Normalise into one shape. Tag each with its origin so the UI can
    // badge the source if it wants to.
    //
    // Order matters here — the client renders this list top-down without
    // re-sorting. So we lead with the queries the user wants to see
    // first: product shots from retailers (jerseys, hats, merch), then
    // pro photography (MaxPreps / Icon Sportswire / Second Crop), then
    // broader fan/crowd content, with Wikimedia stadium photos last
    // (still useful, but lower-impact for the merch story).
    const photos = [
      ...webMerch.map((p) => ({
        title: p.title,
        thumbUrl: p.thumbUrl,
        sourceUrl: p.sourceUrl,
        width: p.width,
        height: p.height,
        origin: p.origin,
        domain: p.domain,
      })),
      ...webPro.map((p) => ({
        title: p.title,
        thumbUrl: p.thumbUrl,
        sourceUrl: p.sourceUrl,
        width: p.width,
        height: p.height,
        origin: p.origin,
        domain: p.domain,
      })),
      ...webFans.map((p) => ({
        title: p.title,
        thumbUrl: p.thumbUrl,
        sourceUrl: p.sourceUrl,
        width: p.width,
        height: p.height,
        origin: p.origin,
        domain: p.domain,
      })),
      ...wikiPhotos.map((p) => ({
        title: p.title,
        thumbUrl: p.thumbUrl,
        sourceUrl: p.descriptionUrl,
        width: p.width,
        height: p.height,
        origin: 'wikimedia' as const,
        domain: 'commons.wikimedia.org',
      })),
    ];

    // Dedupe by thumbUrl in case the same image surfaced in multiple queries.
    const seen = new Set<string>();
    const deduped = photos.filter((p) => {
      if (seen.has(p.thumbUrl)) return false;
      seen.add(p.thumbUrl);
      return true;
    });

    res.json({ photos: deduped });
  } catch (err) {
    console.error('[merch]', team.id, err);
    res.status(502).json({ error: (err as Error).message });
  }
});

// Proxy an upload.wikimedia.org URL so the client can render it without
// CORS / hot-link issues. Memoised by URL so a re-render or back-button
// won't re-hit Wikimedia (their CDN 429s aggressive parallel reloads).
const imgCache = new Map<string, { contentType: string; body: Buffer }>();
const IMG_CACHE_MAX = 500;

// Hosts the proxy will fetch. Wikimedia (logos + Wikipedia article images)
// and Bing's image-search CDN (which DuckDuckGo's results thumb through).
// We intentionally don't proxy arbitrary third-party domains — the user
// clicks the result card to follow the source URL on the host site.
// Bing serves DDG-indexed thumbnails from many subdomain shards — th,
// thf, thfvnext, ths, etc. The pattern is always th-something on bing.com,
// so we accept the whole th*.bing.com family. Wikimedia and the legacy
// Bing tse cache are also allowed.
const PROXY_HOST_RX =
  /^https:\/\/(upload\.wikimedia\.org|commons\.wikimedia\.org|tse[0-9]+\.mm\.bing\.net|th[a-z0-9]*\.bing\.com)\//;

app.get('/api/img', async (req, res) => {
  const url = String(req.query.url || '');
  if (!PROXY_HOST_RX.test(url)) {
    return res.status(400).send('bad url');
  }

  const cached = imgCache.get(url);
  if (cached) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(cached.body);
  }

  try {
    const { fetch } = await import('undici');
    const upstream = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!upstream.ok || !upstream.body) return res.status(upstream.status).end();
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const body = Buffer.from(await upstream.arrayBuffer());

    // Drop the oldest entry when full — simple FIFO is fine for image cache.
    if (imgCache.size >= IMG_CACHE_MAX) {
      const firstKey = imgCache.keys().next().value;
      if (firstKey) imgCache.delete(firstKey);
    }
    imgCache.set(url, { contentType, body });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(body);
  } catch (err) {
    res.status(502).send((err as Error).message);
  }
});

// =============================================================================
// Export to disk.
//
// Writes a team's logo variants to a user-friendly folder structure under
// EXPORT_ROOT. Two endpoints share the same machinery:
//
//   POST /api/export/:id                 → save every variant
//   POST /api/export/:id/:variantId      → save a single variant
//
// Each export writes the SVG plus a high-resolution PNG render of the
// same variant, so the user can drop either format straight into
// downstream tools. The folder layout matches what the user asked for:
//
//   /Users/designer/Documents/Projects/DRAFT PICKS/TEAMS/<LEAGUE>/<TEAM>/
//     San Francisco Giants - Primary.svg
//     San Francisco Giants - Primary.png
//     ...
// =============================================================================

const PNG_WIDTH = 1024;

// Macros for league folder name. Most leagues are already filesystem-safe,
// but we still strip anything that could mess up paths in a ZIP entry
// (or when the client unpacks the ZIP into a chosen directory).
function safeFolderPart(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Send a ZIP stream of the given entries to the response. The client
// either unpacks it directly via a FileSystemDirectoryHandle (Chrome /
// Edge / Brave) or downloads it (Safari / Firefox).
type ZipEntry = { path: string; data: Buffer };
type ZipDir = { dir: string }; // empty-folder marker

function streamZip(
  res: express.Response,
  filename: string,
  entries: (ZipEntry | ZipDir)[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.on('end', () => resolve());
    archive.pipe(res);
    for (const e of entries) {
      if ('dir' in e) {
        // archiver needs a trailing slash on the name + null content.
        archive.append(null, { name: e.dir.endsWith('/') ? e.dir : `${e.dir}/` });
      } else {
        archive.append(e.data, { name: e.path });
      }
    }
    archive.finalize();
  });
}

async function renderVariantEntries(
  team: Team,
  variant: LogoVariant,
  baseDir: string,
): Promise<ZipEntry[]> {
  const stem = `${safeFolderPart(team.name)} - ${variant.label}`;
  const sourceBytes = await readFile(path.join(LOGO_DIR, variant.fileName));
  const sourceIsPng = variant.fileName.toLowerCase().endsWith('.png');

  const entries: ZipEntry[] = [];
  if (!sourceIsPng) {
    entries.push({ path: `${baseDir}/${stem}.svg`, data: sourceBytes });
  }
  const png = await sharp(sourceBytes, sourceIsPng ? undefined : { density: 300 })
    .resize({ width: PNG_WIDTH, withoutEnlargement: false })
    .png()
    .toBuffer();
  entries.push({ path: `${baseDir}/${stem}.png`, data: png });
  return entries;
}

async function buildTeamExport(
  id: string,
  variantIds: string[] | 'all',
): Promise<{ baseDir: string; entries: ZipEntry[]; teamCount: number }> {
  const teams = await getTeams();
  const team = teams.find((t) => t.id === id);
  if (!team) throw new Error('team not found');

  const baseDir = `${safeFolderPart(team.league)}/${safeFolderPart(team.name)}`;
  const wanted =
    variantIds === 'all'
      ? team.logos
      : team.logos.filter((l) => variantIds.includes(l.variantId));
  if (wanted.length === 0) {
    throw new Error('no matching variants');
  }

  const entries: ZipEntry[] = [];
  for (const v of wanted) {
    for (const e of await renderVariantEntries(team, v, baseDir)) entries.push(e);
  }
  return { baseDir, entries, teamCount: 1 };
}

app.post('/api/export/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^[a-z0-9-]+$/i.test(id)) return res.status(400).json({ error: 'bad id' });
  try {
    const { baseDir, entries } = await buildTeamExport(id, 'all');
    const zipName = `${safeFolderPart(baseDir.split('/').pop()!)}.zip`;
    await streamZip(res, zipName, entries);
  } catch (err) {
    console.error('[export-all]', id, err);
    if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/export/:id/:variantId', async (req, res) => {
  const { id, variantId } = req.params;
  if (!/^[a-z0-9-]+$/i.test(id) || !/^[a-z0-9-]+$/i.test(variantId)) {
    return res.status(400).json({ error: 'bad id' });
  }
  try {
    const { baseDir, entries } = await buildTeamExport(id, [variantId]);
    const teamName = baseDir.split('/').pop()!;
    const zipName = `${teamName} - ${variantId}.zip`;
    await streamZip(res, zipName, entries);
  } catch (err) {
    console.error('[export-one]', id, variantId, err);
    if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
  }
});

// =============================================================================
// Bulk per-league export.
//
//   POST /api/export-league/:league
//
// Writes EVERY team in the league as PNG bundles, organised by colour
// treatment under one shared `all/` folder so they're easy to pick up
// for further work:
//
//   <ROOT>/<LEAGUE>/all/colour/<Team Name>.png            ← primary, full colour
//   <ROOT>/<LEAGUE>/all/black and white/<Team Name>
//                                       — Mono Black.png
//                                       — Mono White.png  ← when available
//
// SVGs are not duplicated here — the per-team detail-modal export
// already writes the SVG alongside its PNG. This bulk endpoint is for
// rapid PNG harvesting only.
// =============================================================================

// =============================================================================
// Pre-create folder structure for a league.
//
//   POST /api/setup-league/:league
//
// Walks every team in the league and ensures
//   <ROOT>/<LEAGUE>/<Team Name>/
// exists, ready for the user to drop assets into. Idempotent — running
// twice is a no-op for teams whose folder already exists.
// =============================================================================

app.post(
  '/api/setup-league/:league',
  async (
    req: express.Request<{ league: string }>,
    res: express.Response,
  ) => {
    const league = req.params.league;
    if (!league || league.length > 64) {
      return res.status(400).json({ error: 'bad league' });
    }
    const teams = await getTeams();
    const members = teams.filter((t) => t.league === league);
    if (members.length === 0) {
      return res.status(404).json({ error: 'no teams in this league' });
    }
    const leagueDir = safeFolderPart(league);
    // ZIP of empty directory entries. The client either creates them via
    // FileSystemDirectoryHandle.getDirectoryHandle({create:true}) or the
    // OS unzip handles them as empty folders when downloading.
    const entries: (ZipEntry | ZipDir)[] = members.map((t) => ({
      dir: `${leagueDir}/${safeFolderPart(t.name)}`,
    }));
    try {
      await streamZip(res, `${leagueDir} - folder structure.zip`, entries);
    } catch (err) {
      console.error('[setup-league]', league, err);
      if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.post(
  '/api/export-league/:league',
  async (
    req: express.Request<{ league: string }>,
    res: express.Response,
  ) => {
    const league = req.params.league;
    if (!league || league.length > 64) {
      return res.status(400).json({ error: 'bad league' });
    }
    const teams = await getTeams();
    const members = teams.filter((t) => t.league === league);
    if (members.length === 0) {
      return res.status(404).json({ error: 'no teams in this league' });
    }

    const leagueDir = safeFolderPart(league);
    const colourDir = `${leagueDir}/all/colour`;
    const bwDir = `${leagueDir}/all/black and white`;
    const entries: ZipEntry[] = [];

    for (const team of members) {
      const stem = safeFolderPart(team.name);

      // 1. Primary in colour
      const primary = team.logos.find((l) => l.variantId === 'primary') ?? team.logos[0];
      if (primary) {
        try {
          const buf = await readFile(path.join(LOGO_DIR, primary.fileName));
          const isPng = primary.fileName.toLowerCase().endsWith('.png');
          const png = await sharp(buf, isPng ? undefined : { density: 300 })
            .resize({ width: PNG_WIDTH, withoutEnlargement: false })
            .png()
            .toBuffer();
          entries.push({ path: `${colourDir}/${stem}.png`, data: png });
        } catch (err) {
          console.warn(`[export-league] primary ${team.id}:`, (err as Error).message);
        }
      }

      // 2. Each available mono variant
      for (const v of team.logos.filter((l) => l.kind === 'monochrome')) {
        try {
          const buf = await readFile(path.join(LOGO_DIR, v.fileName));
          const isPng = v.fileName.toLowerCase().endsWith('.png');
          const png = await sharp(buf, isPng ? undefined : { density: 300 })
            .resize({ width: PNG_WIDTH, withoutEnlargement: false })
            .png()
            .toBuffer();
          entries.push({ path: `${bwDir}/${stem} — ${v.label}.png`, data: png });
        } catch (err) {
          console.warn(
            `[export-league] mono ${team.id}/${v.variantId}:`,
            (err as Error).message,
          );
        }
      }
    }

    try {
      await streamZip(res, `${leagueDir} - all logos.zip`, entries);
    } catch (err) {
      console.error('[export-league]', league, err);
      if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
    }
  },
);

// =============================================================================
// Production static serving.
//
// In dev (`npm run dev`) the Vite dev server runs on its own port and
// proxies /api to this Express server. In production (Render), one
// process serves everything — built client at client/dist/ plus the API
// — on whatever PORT Render injects. We gate the static-file mount on
// NODE_ENV so it doesn't fight with Vite during local dev.
// =============================================================================
import { existsSync } from 'node:fs';
if (process.env.NODE_ENV === 'production' && existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: false }));
  // SPA fallback — anything not matching an /api/... route serves the
  // index.html so deep links and refreshes work.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

const port = Number(process.env.PORT) || 8788;
app.listen(port, () => {
  console.log(`server → http://localhost:${port}`);
});
