import { useState } from 'react';

type Props = { hex: string };

export function ColorSwatch({ hex }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Older browsers / insecure contexts — fall back to a textarea trick.
      const ta = document.createElement('textarea');
      ta.value = hex;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  }

  // Light/dark text on the chip — luminance threshold matches WCAG-ish 0.5.
  const lum = relativeLuminance(hex);
  const textCls = lum > 0.5 ? 'text-ink' : 'text-paper';

  return (
    <button
      onClick={copy}
      className={`group relative flex items-center gap-2 rounded-md border border-stone/60 px-2.5 py-2 text-left transition hover:border-ink/40 hover:shadow-sm`}
      title="Click to copy"
    >
      <span
        className="h-6 w-6 shrink-0 rounded border border-black/10"
        style={{ background: hex }}
      />
      <span className="font-mono text-xs uppercase tracking-wide">{hex}</span>
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-md text-xs font-medium transition ${
          copied ? 'opacity-100' : 'opacity-0'
        } ${textCls}`}
        style={{ background: copied ? hex : 'transparent' }}
      >
        Copied
      </span>
    </button>
  );
}

function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '');
  if (c.length !== 6) return 0.5;
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
