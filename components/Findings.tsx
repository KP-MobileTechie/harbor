"use client";

// ---------------------------------------------------------------------------
// Findings.tsx — privacy and security findings, ranked by severity. Evidence is
// already masked by the engine (e.g. only the last few characters of a token),
// so a full secret is never re-displayed here. Each finding shows its kind
// (secret, PII, tracker), where it was seen, and the masked evidence.
// ---------------------------------------------------------------------------

import type { PrivacyFinding, Severity } from "@/lib/har/privacy";

const SEVERITY_STYLE: Record<Severity, { dot: string; chip: string; label: string }> = {
  high: { dot: "bg-red-500", chip: "bg-red-500/15 text-red-300", label: "High" },
  medium: { dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-300", label: "Medium" },
  low: { dot: "bg-zinc-500", chip: "bg-zinc-700/40 text-zinc-300", label: "Low" },
};

export function Findings({ items }: { items: PrivacyFinding[] }) {
  if (!items.length) {
    return <p className="text-sm text-zinc-500">No leaked secrets, exposed PII, or tracker requests were detected.</p>;
  }

  const counts = items.reduce(
    (acc, f) => ((acc[f.severity] += 1), acc),
    { high: 0, medium: 0, low: 0 } as Record<Severity, number>,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-[11px]">
        {(Object.keys(counts) as Severity[]).map((sev) =>
          counts[sev] ? (
            <span key={sev} className={`rounded px-1.5 py-0.5 ${SEVERITY_STYLE[sev].chip}`}>
              {counts[sev]} {SEVERITY_STYLE[sev].label.toLowerCase()}
            </span>
          ) : null,
        )}
      </div>

      <ul className="space-y-2">
        {items.map((f, i) => {
          const style = SEVERITY_STYLE[f.severity];
          return (
            <li key={`${f.kind}-${f.where}-${i}`} className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-zinc-200">{f.title}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${style.chip}`}>{f.kind}</span>
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-zinc-500" title={f.where}>{f.where}</p>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-400">evidence: {f.evidence}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
