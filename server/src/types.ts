export type Sport =
  | 'american-football'
  | 'college-football'
  | 'basketball'
  | 'college-basketball'
  | 'womens-basketball'
  | 'baseball'
  | 'ice-hockey'
  | 'football';

export type SeedTeam = {
  id: string;
  name: string;
  sport: Sport;
  league: string;
  wikipediaTitle: string;
  colors: string[];
};

export type LogoKind =
  | 'primary'
  | 'wordmark'
  | 'alternate'
  | 'heritage'
  | 'helmet'
  | 'monochrome';

export type LogoVariant = {
  variantId: string;          // 'primary' | 'wordmark' | 'heritage-1979' | 'mono-black' | ...
  kind: LogoKind;
  label: string;              // human-readable, e.g. 'Heritage (1979)'
  fileName: string;           // file on disk: 'cfb-alabama.svg' | 'cfb-alabama__mono-black.svg'
  sourceUrl: string | null;   // null for derived (mono) variants
};

export type Team = SeedTeam & {
  logos: LogoVariant[];
};

export type CacheShape = {
  updatedAt: string | null;
  teams: Team[];
};
