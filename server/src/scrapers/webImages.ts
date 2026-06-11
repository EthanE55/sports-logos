// Web image search for team merch / fans / crowd / game photography.
//
// We use DuckDuckGo's two-step image-search flow as the source:
//
//   1. GET https://duckduckgo.com/?q=<query>&iax=images&ia=images
//      Returns an HTML page that embeds a session-scoped `vqd` token.
//   2. GET https://duckduckgo.com/i.js?q=<query>&vqd=<token>&o=json&l=us-en
//      Returns JSON with up to ~90 image results — title, source page URL,
//      original image URL, and a Bing-CDN thumbnail URL.
//
// We DON'T proxy the original image URLs (they live on arbitrary
// third-party sites with no consistent CORS / hot-link policy). We render
// the Bing thumbnail in the grid and link the card to the source page so
// the user can fetch the full asset themselves.
//
// Notes on the alternatives we tried but couldn't ship:
//   - Unsplash blocks server-side scraping via the "Anubis" PoW challenge.
//     The official API works but requires the user to register for an
//     access key — set UNSPLASH_ACCESS_KEY in env to enable.
//   - Pexels HTML scraping hits a Cloudflare challenge.
//   - Pinterest serves a JS-only SPA without login; the search route
//     returns no pin data to a vanilla HTTP client.

import { fetch } from 'undici';
import { UA } from '../utils.ts';

const DDG_BASE = 'https://duckduckgo.com';

export type WebImage = {
  title: string;
  thumbUrl: string;
  sourceUrl: string;        // page hosting the image
  imageUrl: string;         // direct image URL (may be hot-link blocked)
  width: number;
  height: number;
  domain: string;           // e.g. "si.com"
  origin: 'duckduckgo';
};

// In-memory cache, keyed by query. Same TTL as our Wikimedia merch cache.
const cache = new Map<string, { at: number; results: WebImage[] }>();
const TTL_MS = 1000 * 60 * 60 * 6;

async function getVqdToken(query: string): Promise<{ vqd: string; cookies: string }> {
  const res = await fetch(
    `${DDG_BASE}/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
    { headers: { 'User-Agent': UA, Accept: 'text/html' } },
  );
  if (!res.ok) throw new Error(`ddg html ${res.status}`);
  const html = await res.text();
  // DDG embeds the token a few different ways depending on the page
  // variant: `vqd="..."`, `vqd=&quot;...&quot;`, or `vqd='...'`.
  const m =
    html.match(/vqd=["']([^"']+)["']/) ||
    html.match(/vqd=&quot;([^&]+)&quot;/) ||
    html.match(/vqd=\\"([^\\]+)\\"/);
  if (!m) throw new Error('vqd token not found');
  const cookies = res.headers.get('set-cookie') ?? '';
  return { vqd: m[1], cookies };
}

type DdgImageResult = {
  title: string;
  image: string;
  thumbnail: string;
  url: string;       // source page URL
  width: number;
  height: number;
};

export async function searchWebImages(
  query: string,
  limit = 24,
): Promise<WebImage[]> {
  const cached = cache.get(query);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.results.slice(0, limit);
  }

  try {
    const { vqd, cookies } = await getVqdToken(query);
    const u = `${DDG_BASE}/i.js?l=us-en&o=json&p=-1&q=${encodeURIComponent(query)}&vqd=${vqd}`;
    const res = await fetch(u, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: `${DDG_BASE}/`,
        Cookie: cookies,
      },
    });
    if (!res.ok) throw new Error(`ddg i.js ${res.status}`);
    const text = await res.text();
    if (text.startsWith('If this error')) {
      // DDG returns plaintext on rate-limit or token expiry — short-circuit.
      throw new Error('ddg api refused (rate-limit or stale token)');
    }
    const data = JSON.parse(text) as { results?: DdgImageResult[] };
    const raw = data.results ?? [];
    const out: WebImage[] = [];
    for (const r of raw) {
      if (!r.thumbnail || !r.url) continue;
      // Skip tiny thumbs.
      if (r.width < 320 || r.height < 240) continue;
      out.push({
        title: r.title || '',
        thumbUrl: r.thumbnail,
        sourceUrl: r.url,
        imageUrl: r.image,
        width: r.width,
        height: r.height,
        domain: domainOf(r.url),
        origin: 'duckduckgo',
      });
      if (out.length >= 60) break;
    }
    cache.set(query, { at: Date.now(), results: out });
    return out.slice(0, limit);
  } catch (err) {
    // Cache the empty result briefly so a flapping DDG endpoint doesn't
    // hammer us each request.
    cache.set(query, { at: Date.now(), results: [] });
    console.warn('[webImages]', query, (err as Error).message);
    return [];
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
