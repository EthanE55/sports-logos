// WNBA — 15 teams as of the 2026 season. Toronto Tempo and Portland Fire
// joined as expansion franchises after the 2026 expansion draft; the
// other 13 returned unchanged from 2025.
//
// Sport is "womens-basketball" (distinct from NBA's "basketball") so the
// shop-link helper can route to fanatics.com/wnba/<team>/ and the
// dominant-colour script keeps the two leagues separate even though the
// court / Wikipedia page structure is similar.

import type { SeedTeam } from './types.ts';

export const WNBA_TEAMS: SeedTeam[] = [
  { id: 'wnba-dream',     sport: 'womens-basketball', league: 'WNBA', name: 'Atlanta Dream',          wikipediaTitle: 'Atlanta Dream',          colors: ['#E31837', '#418FDE', '#FFFFFF', '#000000'] },
  { id: 'wnba-sky',       sport: 'womens-basketball', league: 'WNBA', name: 'Chicago Sky',            wikipediaTitle: 'Chicago Sky',            colors: ['#418FDE', '#FFD100', '#000000'] },
  { id: 'wnba-sun',       sport: 'womens-basketball', league: 'WNBA', name: 'Connecticut Sun',        wikipediaTitle: 'Connecticut Sun',        colors: ['#E03A3E', '#0A2240', '#F58220'] },
  { id: 'wnba-wings',     sport: 'womens-basketball', league: 'WNBA', name: 'Dallas Wings',           wikipediaTitle: 'Dallas Wings',           colors: ['#C8102E', '#1D42BA', '#9EA2A2'] },
  { id: 'wnba-valkyries', sport: 'womens-basketball', league: 'WNBA', name: 'Golden State Valkyries', wikipediaTitle: 'Golden State Valkyries', colors: ['#5A2D81', '#000000', '#FFFFFF'] },
  { id: 'wnba-fever',     sport: 'womens-basketball', league: 'WNBA', name: 'Indiana Fever',          wikipediaTitle: 'Indiana Fever',          colors: ['#E03A3E', '#FDBB30', '#002D62'] },
  { id: 'wnba-aces',      sport: 'womens-basketball', league: 'WNBA', name: 'Las Vegas Aces',         wikipediaTitle: 'Las Vegas Aces',         colors: ['#000000', '#A7A8AA', '#BA0C2F'] },
  { id: 'wnba-sparks',    sport: 'womens-basketball', league: 'WNBA', name: 'Los Angeles Sparks',     wikipediaTitle: 'Los Angeles Sparks',     colors: ['#552583', '#FDB927', '#000000'] },
  { id: 'wnba-lynx',      sport: 'womens-basketball', league: 'WNBA', name: 'Minnesota Lynx',         wikipediaTitle: 'Minnesota Lynx',         colors: ['#236192', '#9EA2A2', '#78BE20', '#000000'] },
  { id: 'wnba-liberty',   sport: 'womens-basketball', league: 'WNBA', name: 'New York Liberty',       wikipediaTitle: 'New York Liberty',       colors: ['#6ECEB2', '#000000', '#86CEBC'] },
  { id: 'wnba-mercury',   sport: 'womens-basketball', league: 'WNBA', name: 'Phoenix Mercury',        wikipediaTitle: 'Phoenix Mercury',        colors: ['#201747', '#E56020', '#63666A'] },
  { id: 'wnba-storm',     sport: 'womens-basketball', league: 'WNBA', name: 'Seattle Storm',          wikipediaTitle: 'Seattle Storm',          colors: ['#2C5234', '#FE5000', '#FEC325'] },
  { id: 'wnba-mystics',   sport: 'womens-basketball', league: 'WNBA', name: 'Washington Mystics',     wikipediaTitle: 'Washington Mystics',     colors: ['#002B5C', '#E03A3E', '#C4CED4'] },
  { id: 'wnba-tempo',     sport: 'womens-basketball', league: 'WNBA', name: 'Toronto Tempo',          wikipediaTitle: 'Toronto Tempo',          colors: ['#A8C7E6', '#6E1F2E', '#000000'] },
  { id: 'wnba-fire',      sport: 'womens-basketball', league: 'WNBA', name: 'Portland Fire',          wikipediaTitle: 'Portland Fire',          colors: ['#E03C31', '#5B3A29', '#1B3A6B', '#F4A6B8'] },
];
