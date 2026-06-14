// NCAA Division I men's basketball — 25 most-followed programs (blue
// bloods plus modern dynasties and perennial Final Four programs).
// Curated set; the catalogue is intentionally smaller than CFB because
// the user-facing point is "top programs" not "every D1 school".

import type { SeedTeam } from './types.ts';

export const NCAAB_TEAMS: SeedTeam[] = [
  { id: 'ncaab-duke',           sport: 'college-basketball', league: 'NCAA Basketball', name: 'Duke Blue Devils',           wikipediaTitle: "Duke Blue Devils men's basketball",           colors: ['#003087', '#FFFFFF'] },
  { id: 'ncaab-north-carolina', sport: 'college-basketball', league: 'NCAA Basketball', name: 'North Carolina Tar Heels',   wikipediaTitle: "North Carolina Tar Heels men's basketball",   colors: ['#7BAFD4', '#13294B', '#FFFFFF'] },
  { id: 'ncaab-kentucky',       sport: 'college-basketball', league: 'NCAA Basketball', name: 'Kentucky Wildcats',          wikipediaTitle: "Kentucky Wildcats men's basketball",          colors: ['#0033A0', '#FFFFFF', '#000000'] },
  { id: 'ncaab-kansas',         sport: 'college-basketball', league: 'NCAA Basketball', name: 'Kansas Jayhawks',            wikipediaTitle: "Kansas Jayhawks men's basketball",            colors: ['#0051BA', '#E8000D', '#FFC82D', '#85898A'] },
  { id: 'ncaab-ucla',           sport: 'college-basketball', league: 'NCAA Basketball', name: 'UCLA Bruins',                wikipediaTitle: "UCLA Bruins men's basketball",                colors: ['#2774AE', '#FFD100', '#FFFFFF'] },
  { id: 'ncaab-uconn',          sport: 'college-basketball', league: 'NCAA Basketball', name: 'Connecticut Huskies',        wikipediaTitle: "Connecticut Huskies men's basketball",        colors: ['#000E2F', '#FFFFFF', '#7C878E'] },
  { id: 'ncaab-indiana',        sport: 'college-basketball', league: 'NCAA Basketball', name: 'Indiana Hoosiers',           wikipediaTitle: "Indiana Hoosiers men's basketball",           colors: ['#990000', '#EEEDEB'] },
  { id: 'ncaab-michigan-state', sport: 'college-basketball', league: 'NCAA Basketball', name: 'Michigan State Spartans',    wikipediaTitle: "Michigan State Spartans men's basketball",    colors: ['#18453B', '#FFFFFF'] },
  { id: 'ncaab-villanova',      sport: 'college-basketball', league: 'NCAA Basketball', name: 'Villanova Wildcats',         wikipediaTitle: "Villanova Wildcats men's basketball",         colors: ['#002664', '#13B5EA', '#847248'] },
  { id: 'ncaab-louisville',     sport: 'college-basketball', league: 'NCAA Basketball', name: 'Louisville Cardinals',       wikipediaTitle: "Louisville Cardinals men's basketball",       colors: ['#AD0000', '#000000'] },
  { id: 'ncaab-gonzaga',        sport: 'college-basketball', league: 'NCAA Basketball', name: 'Gonzaga Bulldogs',           wikipediaTitle: "Gonzaga Bulldogs men's basketball",           colors: ['#041E42', '#C8102E', '#C1C6C8'] },
  { id: 'ncaab-arizona',        sport: 'college-basketball', league: 'NCAA Basketball', name: 'Arizona Wildcats',           wikipediaTitle: "Arizona Wildcats men's basketball",           colors: ['#CC0033', '#003366'] },
  { id: 'ncaab-syracuse',       sport: 'college-basketball', league: 'NCAA Basketball', name: 'Syracuse Orange',            wikipediaTitle: "Syracuse Orange men's basketball",            colors: ['#F76900', '#000E54', '#FFFFFF'] },
  { id: 'ncaab-michigan',       sport: 'college-basketball', league: 'NCAA Basketball', name: 'Michigan Wolverines',        wikipediaTitle: "Michigan Wolverines men's basketball",        colors: ['#00274C', '#FFCB05'] },
  { id: 'ncaab-ohio-state',     sport: 'college-basketball', league: 'NCAA Basketball', name: 'Ohio State Buckeyes',        wikipediaTitle: "Ohio State Buckeyes men's basketball",        colors: ['#BA0C2F', '#A7B1B7', '#FFFFFF'] },
  { id: 'ncaab-florida',        sport: 'college-basketball', league: 'NCAA Basketball', name: 'Florida Gators',             wikipediaTitle: "Florida Gators men's basketball",             colors: ['#FA4616', '#0021A5'] },
  { id: 'ncaab-texas',          sport: 'college-basketball', league: 'NCAA Basketball', name: 'Texas Longhorns',            wikipediaTitle: "Texas Longhorns men's basketball",            colors: ['#BF5700', '#FFFFFF'] },
  { id: 'ncaab-maryland',       sport: 'college-basketball', league: 'NCAA Basketball', name: 'Maryland Terrapins',         wikipediaTitle: "Maryland Terrapins men's basketball",         colors: ['#E21833', '#FFD200', '#000000', '#FFFFFF'] },
  { id: 'ncaab-wisconsin',      sport: 'college-basketball', league: 'NCAA Basketball', name: 'Wisconsin Badgers',          wikipediaTitle: "Wisconsin Badgers men's basketball",          colors: ['#C5050C', '#FFFFFF'] },
  { id: 'ncaab-illinois',       sport: 'college-basketball', league: 'NCAA Basketball', name: 'Illinois Fighting Illini',   wikipediaTitle: "Illinois Fighting Illini men's basketball",   colors: ['#FF5F05', '#13294B'] },
  { id: 'ncaab-memphis',        sport: 'college-basketball', league: 'NCAA Basketball', name: 'Memphis Tigers',             wikipediaTitle: "Memphis Tigers men's basketball",             colors: ['#003087', '#898D8D', '#F8992E'] },
  { id: 'ncaab-marquette',      sport: 'college-basketball', league: 'NCAA Basketball', name: 'Marquette Golden Eagles',    wikipediaTitle: "Marquette Golden Eagles men's basketball",    colors: ['#003366', '#FFCC00'] },
  { id: 'ncaab-georgetown',     sport: 'college-basketball', league: 'NCAA Basketball', name: 'Georgetown Hoyas',           wikipediaTitle: "Georgetown Hoyas men's basketball",           colors: ['#041E42', '#63666A'] },
  { id: 'ncaab-houston',        sport: 'college-basketball', league: 'NCAA Basketball', name: 'Houston Cougars',            wikipediaTitle: "Houston Cougars men's basketball",            colors: ['#C8102E', '#76232F', '#B2B4B2'] },
  { id: 'ncaab-purdue',         sport: 'college-basketball', league: 'NCAA Basketball', name: 'Purdue Boilermakers',        wikipediaTitle: "Purdue Boilermakers men's basketball",        colors: ['#CFB991', '#000000'] },

  // Stanford + the 8 Ivy League schools (men's basketball only — Ivies
  // play FCS football, not FBS, so they're not in teams-cfb.ts).
  // Brand colours verified against each school's identity / brand portal
  // where available, else teamcolorcodes.com.
  { id: 'ncaab-stanford',       sport: 'college-basketball', league: 'NCAA Basketball', name: 'Stanford Cardinal',          wikipediaTitle: "Stanford Cardinal men's basketball",          colors: ['#8C1515', '#2E2D29', '#53565A', '#FFFFFF'] },
  { id: 'ncaab-brown',          sport: 'college-basketball', league: 'NCAA Basketball', name: 'Brown Bears',                wikipediaTitle: "Brown Bears men's basketball",                colors: ['#4E3629', '#ED1C24', '#FFC72C'] },
  { id: 'ncaab-columbia',       sport: 'college-basketball', league: 'NCAA Basketball', name: 'Columbia Lions',             wikipediaTitle: "Columbia Lions men's basketball",             colors: ['#9BCBEB', '#003865', '#FFFFFF'] },
  { id: 'ncaab-cornell',        sport: 'college-basketball', league: 'NCAA Basketball', name: 'Cornell Big Red',            wikipediaTitle: "Cornell Big Red men's basketball",            colors: ['#B31B1B', '#222222', '#FFFFFF'] },
  { id: 'ncaab-dartmouth',      sport: 'college-basketball', league: 'NCAA Basketball', name: 'Dartmouth Big Green',        wikipediaTitle: "Dartmouth Big Green men's basketball",        colors: ['#00693E', '#12312B', '#FFFFFF'] },
  { id: 'ncaab-harvard',        sport: 'college-basketball', league: 'NCAA Basketball', name: 'Harvard Crimson',            wikipediaTitle: "Harvard Crimson men's basketball",            colors: ['#A51C30', '#1E1E1E', '#FFFFFF'] },
  { id: 'ncaab-penn',           sport: 'college-basketball', league: 'NCAA Basketball', name: 'Penn Quakers',               wikipediaTitle: "Penn Quakers men's basketball",               colors: ['#990000', '#011F5B', '#FFFFFF'] },
  { id: 'ncaab-princeton',      sport: 'college-basketball', league: 'NCAA Basketball', name: 'Princeton Tigers',           wikipediaTitle: "Princeton Tigers men's basketball",           colors: ['#E77500', '#000000', '#FFFFFF'] },
  { id: 'ncaab-yale',           sport: 'college-basketball', league: 'NCAA Basketball', name: 'Yale Bulldogs',              wikipediaTitle: "Yale Bulldogs men's basketball",              colors: ['#00356B', '#FFFFFF'] },
];
