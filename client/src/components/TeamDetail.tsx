import { useEffect, useMemo, useState } from 'react';
import {
  MERCH_SPORTS,
  shopUrl,
  type LogoVariantInfo,
  type MerchPhoto,
  type Team,
} from '../types.ts';
import { ColorSwatch } from './ColorSwatch.tsx';
import { exportEndpoints, fetchMerch, svgUrl } from '../api.ts';
import { useDestinationHandle } from '../destination.ts';
import { runExport, type ExportSummary } from '../exporter.ts';

type ToastState =
  | { kind: 'ok'; result: ExportSummary }
  | { kind: 'err'; message: string }
  | null;

type Props = {
  team: Team;
  onClose: () => void;
};

export function TeamDetail({ team, onClose }: Props) {
  const merchEnabled = MERCH_SPORTS.has(team.sport);

  // Logos come back from the API ordered by score, but the UI wants the
  // primary first then a stable order. Sort by kind priority + label.
  const orderedLogos = useMemo(() => orderLogos(team.logos), [team.logos]);
  const [activeVariant, setActiveVariant] = useState<string | null>(
    orderedLogos[0]?.variantId ?? null,
  );

  // Reset the active variant when the team changes (parent passes a new
  // team object on each card click).
  useEffect(() => {
    setActiveVariant(orderedLogos[0]?.variantId ?? null);
  }, [team.id, orderedLogos]);

  const active = orderedLogos.find((l) => l.variantId === activeVariant) ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative my-8 w-full max-w-3xl overflow-hidden rounded-2xl bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 h-8 w-8 rounded-full bg-stone/40 text-ink hover:bg-stone/60"
          aria-label="Close"
        >
          ×
        </button>

        {/* Main logo viewport — switches background to a soft tone for mono-white */}
        <div
          className="flex h-64 items-center justify-center transition-colors"
          style={{
            background:
              active?.variantId === 'mono-white'
                ? '#1c1c1c'
                : 'linear-gradient(135deg, #F2EFE6 0%, #FAFAF7 100%)',
          }}
        >
          {active ? (
            <img
              src={svgUrl(team.id, active.variantId)}
              alt={`${team.name} ${active.label}`}
              className="max-h-44 max-w-[55%] object-contain"
            />
          ) : (
            <div className="text-sm text-ink/50">
              No SVG available — run `npm run refresh`
            </div>
          )}
        </div>

        <div className="space-y-5 p-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-ink/50">
              {team.league}
            </div>
            <h2 className="font-display text-2xl font-semibold leading-tight">
              {team.name}
            </h2>
          </div>

          {orderedLogos.length > 1 && (
            <LogoVariantStrip
              team={team}
              variants={orderedLogos}
              activeVariant={activeVariant}
              onSelect={setActiveVariant}
            />
          )}

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-widest text-ink/50">
                Colours · click to copy
              </div>
              <CopyPaletteButton colors={team.colors} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {team.colors.map((c) => (
                <ColorSwatch key={c} hex={c} />
              ))}
            </div>
          </div>

          <ExportActions team={team} active={active} />

          {merchEnabled && <MerchSection teamId={team.id} />}
        </div>
      </div>
    </div>
  );
}

function CopyPaletteButton({ colors }: { colors: string[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    // Join hex codes one per line — the format the user asked for.
    const text = colors.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers / non-secure contexts — same textarea fallback the
      // single-swatch button uses.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={copy}
      className="rounded-md border border-stone/60 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-ink/70 transition hover:border-ink/40 hover:text-ink"
    >
      {copied ? `Copied ${colors.length} hex` : 'Copy palette'}
    </button>
  );
}

function ExportActions({
  team,
  active,
}: {
  team: Team;
  active: LogoVariantInfo | null;
}) {
  const { handle } = useDestinationHandle();
  const [busy, setBusy] = useState<'one' | 'all' | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  async function doExport(kind: 'one' | 'all') {
    setBusy(kind);
    setToast(null);
    try {
      const endpoint =
        kind === 'one' && active
          ? exportEndpoints.variant(team.id, active.variantId)
          : exportEndpoints.team(team.id);
      const fallback =
        kind === 'one' && active
          ? `${team.name} - ${active.label}.zip`
          : `${team.name}.zip`;
      const result = await runExport(endpoint, handle, fallback);
      setToast({ kind: 'ok', result });
    } catch (err) {
      setToast({ kind: 'err', message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-stone/60 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        {active && (
          <button
            onClick={() => doExport('one')}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink/85 disabled:opacity-50"
          >
            {busy === 'one' ? 'Saving…' : `Save ${active.label} (SVG + PNG)`}
          </button>
        )}
        <button
          onClick={() => doExport('all')}
          disabled={busy !== null || team.logos.length === 0}
          className="inline-flex items-center gap-2 rounded-md border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper disabled:opacity-50"
        >
          {busy === 'all'
            ? 'Saving all…'
            : `Download all (${team.logos.length} × SVG + PNG)`}
        </button>
        <a
          href={shopUrl(team)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm font-medium text-ink/80 underline-offset-4 hover:underline"
        >
          Team shop ↗
        </a>
        <a
          href={`https://en.wikipedia.org/wiki/${encodeURIComponent(team.wikipediaTitle)}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-ink/60 underline-offset-4 hover:underline"
        >
          Wikipedia ↗
        </a>
      </div>

      {toast?.kind === 'ok' && (
        <div
          className={`rounded-md border p-3 text-xs ${
            toast.result.mode === 'handle'
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-blue-200 bg-blue-50 text-blue-900'
          }`}
        >
          <div className="font-medium">
            {toast.result.mode === 'handle'
              ? `Saved ${toast.result.fileCount} file${toast.result.fileCount === 1 ? '' : 's'}`
              : 'Downloaded ZIP — unzip to use'}
          </div>
          <div className="mt-1 text-[11px] opacity-80">
            in {toast.result.destinationLabel}
          </div>
        </div>
      )}
      {toast?.kind === 'err' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          Couldn't save — {toast.message}
        </div>
      )}
    </div>
  );
}

const KIND_ORDER: Record<LogoVariantInfo['kind'], number> = {
  primary: 0,
  wordmark: 1,
  alternate: 2,
  heritage: 3,
  helmet: 4,
  monochrome: 5,
};

function orderLogos(logos: LogoVariantInfo[]): LogoVariantInfo[] {
  return [...logos].sort((a, b) => {
    const ka = KIND_ORDER[a.kind] ?? 99;
    const kb = KIND_ORDER[b.kind] ?? 99;
    if (ka !== kb) return ka - kb;
    // Within a kind, primary first, then mono-black before mono-white, then label.
    if (a.variantId === 'primary') return -1;
    if (b.variantId === 'primary') return 1;
    if (a.variantId === 'mono-black') return -1;
    if (b.variantId === 'mono-black') return 1;
    return a.label.localeCompare(b.label);
  });
}

function LogoVariantStrip({
  team,
  variants,
  activeVariant,
  onSelect,
}: {
  team: Team;
  variants: LogoVariantInfo[];
  activeVariant: string | null;
  onSelect: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-xs font-medium uppercase tracking-widest text-ink/50">
          Logo variants · {variants.length}
        </div>
        <div className="text-xs text-ink/40">click to preview, hit download below</div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {variants.map((v) => {
          const isActive = v.variantId === activeVariant;
          const dark = v.variantId === 'mono-white';
          return (
            <button
              key={v.variantId}
              onClick={() => onSelect(v.variantId)}
              className={`group flex flex-col overflow-hidden rounded-lg border text-left transition ${
                isActive
                  ? 'border-ink shadow-sm'
                  : 'border-stone/60 hover:border-ink/30'
              }`}
            >
              <div
                className="flex h-16 items-center justify-center"
                style={{
                  background: dark
                    ? '#1c1c1c'
                    : 'linear-gradient(135deg, #F2EFE6 0%, #FAFAF7 100%)',
                }}
              >
                <img
                  src={svgUrl(team.id, v.variantId)}
                  alt={v.label}
                  className="max-h-12 max-w-[80%] object-contain"
                  loading="lazy"
                />
              </div>
              <div className="px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-ink/40">
                  {v.kind}
                </div>
                <div className="truncate text-xs font-medium leading-tight">
                  {v.label}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MerchSection({ teamId }: { teamId: string }) {
  const [photos, setPhotos] = useState<MerchPhoto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetchMerch(teamId)
      .then((p) => {
        if (!cancelled) setPhotos(p);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return (
    <div className="border-t border-stone/60 pt-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-xs font-medium uppercase tracking-widest text-ink/50">
          Fan &amp; on-field photos
        </div>
        {photos && photos.length > 0 && (
          <span className="text-xs text-ink/40">
            {photos.length} from Wikimedia · click for source
          </span>
        )}
      </div>

      {loading && <div className="text-sm text-ink/50">Loading photos…</div>}
      {err && (
        <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}
      {!loading && photos && photos.length === 0 && (
        <div className="text-sm text-ink/40">
          No Wikimedia photos found for this team.
        </div>
      )}
      {photos && photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p, i) => (
            <a
              key={`${p.thumbUrl}-${i}`}
              href={p.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="group relative block overflow-hidden rounded-lg border border-stone/60 bg-stone/30"
              title={p.title.replace(/^File:/, '')}
            >
              <img
                src={`/api/img?url=${encodeURIComponent(p.thumbUrl)}`}
                alt={p.title}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition group-hover:scale-105"
              />
              <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {p.origin === 'wikimedia' ? 'Wikimedia' : p.domain || 'Web'}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
