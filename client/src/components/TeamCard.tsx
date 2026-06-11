import type { Team } from '../types.ts';
import { svgUrl } from '../api.ts';

type Props = {
  team: Team;
  onClick: () => void;
};

export function TeamCard({ team, onClick }: Props) {
  const primary = team.colors[0] ?? '#111';
  return (
    <button
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-stone/60 bg-paper text-left transition hover:-translate-y-0.5 hover:border-ink/30 hover:shadow-md"
    >
      <div
        className="relative flex h-32 items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #F2EFE6 0%, #FAFAF7 100%)' }}
      >
        {team.hasLogo ? (
          <img
            src={svgUrl(team.id)}
            alt={`${team.name} logo`}
            className="max-h-20 max-w-[60%] object-contain transition group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-paper"
            style={{ background: primary }}
          >
            {initials(team.name)}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="text-sm font-medium leading-tight">{team.name}</div>
        <div className="flex gap-1">
          {team.colors.slice(0, 5).map((c) => (
            <span
              key={c}
              className="h-3 flex-1 rounded-sm border border-black/5"
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
    </button>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
