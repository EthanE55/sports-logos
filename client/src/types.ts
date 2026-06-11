export type Sport =
  | 'american-football'
  | 'college-football'
  | 'basketball'
  | 'college-basketball'
  | 'womens-basketball'
  | 'baseball'
  | 'ice-hockey'
  | 'football';

export type LogoKind =
  | 'primary'
  | 'wordmark'
  | 'alternate'
  | 'heritage'
  | 'helmet'
  | 'monochrome';

export type LogoVariantInfo = {
  variantId: string;
  kind: LogoKind;
  label: string;
};

export type Team = {
  id: string;
  name: string;
  sport: Sport;
  league: string;
  colors: string[];
  wikipediaTitle: string;
  hasLogo: boolean;
  logos: LogoVariantInfo[];
};

export const SPORT_LABELS: Record<Sport, string> = {
  'american-football': 'NFL',
  'college-football': 'College Football',
  basketball: 'Basketball',
  'college-basketball': 'NCAA Basketball',
  'womens-basketball': 'WNBA',
  baseball: 'Baseball',
  'ice-hockey': 'Ice Hockey',
  football: 'Football',
};

// Descriptive sport name for the per-league export header line.
// Distinct from SPORT_LABELS, which uses the short league name ("NFL")
// for the UI filter chips.
export const SPORT_EXPORT_NAMES: Record<Sport, string> = {
  'american-football': 'American Football',
  'college-football': 'College Football',
  basketball: 'Basketball',
  'college-basketball': "College Basketball",
  'womens-basketball': "Women's Basketball",
  baseball: 'Baseball',
  'ice-hockey': 'Ice Hockey',
  football: 'Football',
};

// Sports whose teams are part of the NCAA — used by the "All NCAA"
// shortcut chip in the filter bar so it covers football + basketball
// (and anything else we add later: NCAA baseball, etc.).
export const NCAA_SPORTS: Set<Sport> = new Set([
  'college-football',
  'college-basketball',
]);

export const SPORT_ORDER: Sport[] = [
  'american-football',
  'college-football',
  'basketball',
  'college-basketball',
  'womens-basketball',
  'baseball',
  'ice-hockey',
  'football',
];

// Sports for which the /api/merch/:id endpoint returns photos. Used by the
// detail view to decide whether to show the merch section.
export const MERCH_SPORTS: Set<Sport> = new Set([
  'american-football',
  'college-football',
  'baseball',
]);

// Best-effort URL for a team's official merch shop. The pro leagues and
// NCAA all sell through Fanatics with consistent URL patterns; European
// football clubs each run their own shop site, so we route to an
// "I'm Feeling Lucky" Google search for those — clicking through lands on
// the club's official store roughly 9 times out of 10.
export function shopUrl(team: {
  name: string;
  league: string;
  sport: Sport;
}): string {
  const slug = team.name
    .toLowerCase()
    // Decompose diacritics so ö → o, é → e, etc. (otherwise our
    // alphanumeric filter strips the umlaut and "Köln" becomes "kln").
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Drop ampersands entirely so "Texas A&M" → "texas am" → "texas-am",
    // matching Fanatics' URL convention. Bare `&` going through the
    // [^a-z0-9]+ rule below would produce "texas-a-m" — wrong.
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  switch (team.sport) {
    case 'american-football':
      return `https://www.fanatics.com/nfl/${slug}/`;
    case 'basketball':
      return `https://www.fanatics.com/nba/${slug}/`;
    case 'womens-basketball':
      return `https://www.fanatics.com/wnba/${slug}/`;
    case 'baseball':
      return `https://www.fanatics.com/mlb/${slug}/`;
    case 'ice-hockey':
      return `https://www.fanatics.com/nhl/${slug}/`;
    case 'college-football':
    case 'college-basketball':
      return `https://www.fanatics.com/college/${slug}/`;
    case 'football':
      // Clubs run their own shop sites; Google's btnI=1 is the closest
      // we get to a one-click direct link without curating every URL.
      return `https://www.google.com/search?btnI=1&q=${encodeURIComponent(
        `${team.name} official store shop`,
      )}`;
  }
}

export type MerchPhoto = {
  title: string;
  thumbUrl: string;
  sourceUrl: string;
  width: number;
  height: number;
  origin: 'wikimedia' | 'duckduckgo';
  domain: string;
};
