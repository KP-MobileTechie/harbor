"use client";

// ---------------------------------------------------------------------------
// Recommendations.tsx — the ranked, actionable output of the audit engine. The
// list arrives pre-sorted (severity, then impact), so we keep that order. Each
// row shows a severity dot, the imperative title, the explanatory detail, and a
// compact magnitude hint. Byte-magnitude rules surface bytes saved/affected;
// the rest surface a count. These are estimates, so the copy stays measured.
// ---------------------------------------------------------------------------

import type { Recommendation } from "@/lib/har/audit";
import type { Severity } from "@/lib/har/privacy";
import { fmtBytes } from "@/lib/format";

const SEVERITY_STYLE: Record<Severity, { dot: string; chip: string; label: string }> = {
  high: { dot: "bg-red-500", chip: "bg-red-500/15 text-red-300", label: "High" },
  medium: { dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-300", label: "Medium" },
  low: { dot: "bg-zinc-500", chip: "bg-zinc-700/40 text-zinc-300", label: "Low" },
};

// Recommendations whose impact is a byte magnitude. For these we show the
// estimated bytes saved/affected; others fall back to an item count.
const BYTE_IMPACT = new Set(["uncompressed-text", "heavy-third-parties", "large-images"]);

function magnitude(r: Recommendation): string {
  if (BYTE_IMPACT.has(r.id)) return `~${fmtBytes(r.impact)}`;
  return `${r.count.toLocaleString()} ${r.count === 1 ? "item" : "items"}`;
}

export function Recommendations({ recommendations }: { recommendations: Recommendation[] }) {
  if (!recommendations.length) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-300">
          ✓
        </span>
        <p className="text-sm text-zinc-300">No issues detected. This capture looks clean.</p>
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {recommendations.map((r, i) => {
        const style = SEVERITY_STYLE[r.severity];
        return (
          <li
            key={r.id}
            className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
          >
            <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-600">
              {i + 1}
            </span>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-zinc-100">{r.title}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${style.chip}`}>
                  {style.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{r.detail}</p>
            </div>
            <span
              className="mt-0.5 shrink-0 self-start rounded-md bg-zinc-800/60 px-2 py-1 font-mono text-[11px] tabular-nums text-zinc-400"
              title="Estimated impact"
            >
              {magnitude(r)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
