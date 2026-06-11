import { useEffect, useMemo, useState } from 'react';
import { exportEndpoints, fetchTeams } from './api.ts';
import {
  clearDestination,
  pickDestination,
  supportsDirectoryPicker,
  useDestinationHandle,
} from './destination.ts';
import { runExport, type ExportSummary } from './exporter.ts';
import {
  NCAA_SPORTS,
  SPORT_EXPORT_NAMES,
  SPORT_LABELS,
  SPORT_ORDER,
  type Sport,
  type Team,
} from './types.ts';

// activeSport accepts either a concrete Sport, the catch-all 'all', or
// the 'ncaa' meta-key that maps to NCAA_SPORTS (college football +
// college basketball, plus anything we add later).
type SportFilter = 'all' | 'ncaa' | Sport;
import { TeamCard } from './components/TeamCard.tsx';
import { TeamDetail } from './components/TeamDetail.tsx';

export default function App() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeSport, setActiveSport] = useState<SportFilter>('all');
  const [activeLeague, setActiveLeague] = useState<string | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Team | null>(null);

  useEffect(() => {
    fetchTeams()
      .then(setTeams)
      .catch((e) => setErr(String(e)));
  }, []);

  // Distinct leagues for the currently-selected sport (or all leagues if no
  // sport is picked). Re-derives from the team list rather than maintaining
  // a separate index — small list, cheap.
  // Helper: does a team match the current sport filter?
  const matchesSport = (t: Team): boolean => {
    if (activeSport === 'all') return true;
    if (activeSport === 'ncaa') return NCAA_SPORTS.has(t.sport);
    return t.sport === activeSport;
  };

  const leagues = useMemo(() => {
    if (!teams) return [];
    const filtered = teams.filter(matchesSport);
    return [...new Set(filtered.map((t) => t.league))];
  }, [teams, activeSport]);

  const visible = useMemo(() => {
    if (!teams) return [];
    const q = query.trim().toLowerCase();
    return teams.filter((t) => {
      if (!matchesSport(t)) return false;
      if (activeLeague !== 'all' && t.league !== activeLeague) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [teams, activeSport, activeLeague, query]);

  // Group the visible teams by league for sectioned display.
  const grouped = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const t of visible) {
      if (!map.has(t.league)) map.set(t.league, []);
      map.get(t.league)!.push(t);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <ExportDestinationBar />
      <header className="border-b border-stone/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Sports Logos &amp; Colours
            </h1>
            <p className="mt-1 text-sm text-ink/60">
              Browse team logos and brand colours. Click any swatch to copy the hex code, or
              download the SVG.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              active={activeSport === 'all'}
              onClick={() => {
                setActiveSport('all');
                setActiveLeague('all');
              }}
            >
              All sports
            </FilterChip>
            {SPORT_ORDER.map((s) => (
              <FilterChip
                key={s}
                active={activeSport === s}
                onClick={() => {
                  setActiveSport(s);
                  setActiveLeague('all');
                }}
              >
                {SPORT_LABELS[s]}
              </FilterChip>
            ))}
            {/*
              Shortcut chip — selects every NCAA team across football AND
              basketball (and anything else we add later). A meta-filter,
              not a Sport value; the matcher above treats 'ncaa' specially.
            */}
            <FilterChip
              active={activeSport === 'ncaa'}
              onClick={() => {
                setActiveSport('ncaa');
                setActiveLeague('all');
              }}
            >
              All NCAA
            </FilterChip>
          </div>

          {leagues.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                small
                active={activeLeague === 'all'}
                onClick={() => setActiveLeague('all')}
              >
                All leagues
              </FilterChip>
              {leagues.map((l) => (
                <FilterChip
                  key={l}
                  small
                  active={activeLeague === l}
                  onClick={() => setActiveLeague(l)}
                >
                  {l}
                </FilterChip>
              ))}
            </div>
          )}

          <div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams…"
              className="w-full max-w-md rounded-md border border-stone/60 bg-paper px-3 py-2 text-sm outline-none ring-ink/20 focus:ring-2"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {!teams && !err && <div className="text-sm text-ink/50">Loading…</div>}

        {teams && visible.length === 0 && (
          <div className="rounded-md border border-stone/60 bg-cream/50 p-6 text-sm text-ink/60">
            No teams match.
          </div>
        )}

        <div className="space-y-10">
          {grouped.map(([league, items]) => (
            <section key={league}>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="font-display text-xl font-semibold">{league}</h2>
                <span className="text-xs text-ink/50">{items.length} teams</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {items.map((t) => (
                  <TeamCard key={t.id} team={t} onClick={() => setSelected(t)} />
                ))}
              </div>
              <LeaguePaletteExport league={league} teams={items} />
            </section>
          ))}
        </div>
      </main>

      {selected && <TeamDetail team={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// Slim bar across the top of the page. Shows the currently-chosen
// export folder (via FileSystemDirectoryHandle) and lets the user pick
// or change it. Browsers without the API show a "ZIP download" notice
// instead.
function ExportDestinationBar() {
  const { handle, loading } = useDestinationHandle();
  const supported = supportsDirectoryPicker();

  return (
    <div className="border-b border-stone/60 bg-cream/60">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-2 text-xs">
        <span className="shrink-0 font-medium uppercase tracking-widest text-ink/50">
          Export to
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink/80">
          {!supported ? (
            <span className="italic text-ink/50">
              Downloads folder · your browser doesn't support direct folder
              writes (Chrome/Edge/Brave do)
            </span>
          ) : loading ? (
            <span className="text-ink/40">checking saved folder…</span>
          ) : handle ? (
            <>
              <span className="font-medium text-ink">{handle.name}</span>
              <span className="ml-1 text-ink/50">/</span>
            </>
          ) : (
            <span className="italic text-ink/50">
              No folder chosen — exports will download as a ZIP. Pick a folder
              to write directly.
            </span>
          )}
        </span>
        {supported && (
          <>
            <button
              onClick={() => pickDestination()}
              className="shrink-0 rounded-md border border-ink/60 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-ink hover:bg-ink hover:text-paper"
            >
              {handle ? 'Change folder' : 'Pick folder'}
            </button>
            {handle && (
              <button
                onClick={() => clearDestination()}
                className="shrink-0 text-[11px] text-ink/50 underline-offset-2 hover:underline"
              >
                Reset
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LeaguePaletteExport({ league, teams }: { league: string; teams: Team[] }) {
  const { handle } = useDestinationHandle();
  const [copied, setCopied] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<ExportSummary | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupResult, setSetupResult] = useState<ExportSummary | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Output shape (matches the user's specified format):
  //
  //   @<Sport Name> - <League>  ---     ← two spaces, three dashes, trailing whitespace
  //   $<Team 1 Name> #color1 #color2 $
  //   <Team 2 Name> #color1 #color2 $
  //   …
  //   <Team N Name> #color1 #color2 $
  //
  // The `$` is a team-record delimiter — a leading `$` precedes the
  // first team, and every team's data ends with ` $`. Hex codes within
  // a team are space-separated, dominant-first (server pre-orders).
  const text = useMemo(() => {
    if (teams.length === 0) return '';
    const sportName = SPORT_EXPORT_NAMES[teams[0].sport];
    const header = `@${sportName} - ${league}  ---     `;
    const lines = teams.map((t) => `${t.name} ${t.colors.join(' ')} $`);
    return `${header}\n$${lines.join('\n')}`;
  }, [teams, league]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function doBulkExport() {
    setBulkBusy(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      setBulkResult(
        await runExport(exportEndpoints.league(league), handle, `${league} - all logos.zip`),
      );
    } catch (err) {
      setBulkError((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function doSetup() {
    setSetupBusy(true);
    setSetupError(null);
    setSetupResult(null);
    try {
      setSetupResult(
        await runExport(
          exportEndpoints.setupLeague(league),
          handle,
          `${league} - folder structure.zip`,
        ),
      );
    } catch (err) {
      setSetupError((err as Error).message);
    } finally {
      setSetupBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-stone/60 bg-cream/40 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-ink/70">
          <span className="font-medium">Export {league}</span>
          <span className="ml-2 text-xs text-ink/50">
            text palette (clipboard) · or all logos as PNG (to disk)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copy}
            className="rounded-md border border-ink bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-ink hover:text-paper"
          >
            {copied ? `Copied ${teams.length} teams` : 'Copy text'}
          </button>
          <button
            onClick={doSetup}
            disabled={setupBusy}
            className="rounded-md border border-ink bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-ink hover:text-paper disabled:opacity-60"
          >
            {setupBusy ? 'Creating…' : `Set up file structure (${teams.length})`}
          </button>
          <button
            onClick={doBulkExport}
            disabled={bulkBusy}
            className="rounded-md border border-ink bg-ink px-3 py-1.5 text-xs font-medium text-paper transition hover:bg-ink/85 disabled:opacity-60"
          >
            {bulkBusy ? 'Exporting…' : `Export all (${teams.length} PNGs)`}
          </button>
        </div>
      </div>
      {setupResult && <ExportToast result={setupResult} verb="Created" />}
      {setupError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          Couldn't create folders — {setupError}
        </div>
      )}
      {bulkResult && <ExportToast result={bulkResult} verb="Saved" />}
      {bulkError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          Couldn't save — {bulkError}
        </div>
      )}
    </div>
  );
}

function ExportToast({
  result,
  verb,
}: {
  result: ExportSummary;
  verb: 'Saved' | 'Created';
}) {
  const colour =
    result.mode === 'handle'
      ? 'border-green-200 bg-green-50 text-green-900'
      : 'border-blue-200 bg-blue-50 text-blue-900';
  const message =
    result.mode === 'handle'
      ? result.dirCount > 0 && result.fileCount === 0
        ? `${verb} ${result.dirCount} folders`
        : `${verb} ${result.fileCount} files${
            result.dirCount > 0 ? ` and ${result.dirCount} folders` : ''
          }`
      : `Downloaded ZIP — unzip to use`;
  return (
    <div className={`rounded-md border p-2 text-xs ${colour}`}>
      <div className="font-medium">{message}</div>
      <div className="mt-1 text-[11px] opacity-80">in {result.destinationLabel}</div>
    </div>
  );
}

function FilterChip({
  active,
  small,
  onClick,
  children,
}: {
  active: boolean;
  small?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const base = small ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  const state = active
    ? 'bg-ink text-paper border-ink'
    : 'bg-paper text-ink/70 border-stone/60 hover:border-ink/30 hover:text-ink';
  return (
    <button onClick={onClick} className={`rounded-full border transition ${base} ${state}`}>
      {children}
    </button>
  );
}
