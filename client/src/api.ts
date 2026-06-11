import type { MerchPhoto, Team } from './types.ts';

// Session-scoped cache-buster. Appended to /api/svg URLs so a page load
// after a server-side scraper update always shows the latest logo (the
// browser would otherwise keep a stale entry under the bare URL until
// its 24h cache expired). Combines with the server's
// `must-revalidate` + ETag to keep bandwidth low: changed → 200, same → 304.
export const ASSET_VERSION = String(Date.now());

export function svgUrl(teamId: string, variantId?: string): string {
  const path = variantId ? `/api/svg/${teamId}/${variantId}` : `/api/svg/${teamId}`;
  return `${path}?v=${ASSET_VERSION}`;
}

export async function fetchTeams(): Promise<Team[]> {
  const res = await fetch('/api/teams');
  if (!res.ok) throw new Error(`teams ${res.status}`);
  const data = (await res.json()) as { teams: Team[] };
  return data.teams;
}

export async function fetchMerch(teamId: string): Promise<MerchPhoto[]> {
  const res = await fetch(`/api/merch/${teamId}`);
  if (!res.ok) throw new Error(`merch ${res.status}`);
  const data = (await res.json()) as { photos: MerchPhoto[] };
  return data.photos;
}

// Endpoint URL builders. All actual POST + ZIP handling lives in
// exporter.ts so the UI routes every flow (handle vs download) through
// one consistent helper.
export const exportEndpoints = {
  variant: (teamId: string, variantId: string) => `/api/export/${teamId}/${variantId}`,
  team: (teamId: string) => `/api/export/${teamId}`,
  league: (league: string) => `/api/export-league/${encodeURIComponent(league)}`,
  setupLeague: (league: string) => `/api/setup-league/${encodeURIComponent(league)}`,
};
