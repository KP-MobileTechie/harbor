"use client";

// ---------------------------------------------------------------------------
// WeightBreakdown.tsx — where the bytes go. A stacked bar splits total transfer
// by resource category, a ranked per-domain list shows the heaviest origins,
// and the biggest individual requests are called out. Compression savings, when
// the engine finds uncompressed text, are surfaced up top.
// ---------------------------------------------------------------------------

import type { WeightBreakdown as WeightData } from "@/lib/har/weight";
import type { MimeCategory } from "@/lib/har/types";
import { fmtBytes } from "@/lib/format";

const CATEGORY_COLOR: Record<MimeCategory, string> = {
  document: "#60a5fa",
  script: "#a78bfa",
  stylesheet: "#f472b6",
  image: "#34d399",
  font: "#fbbf24",
  xhr: "#22d3ee",
  media: "#fb923c",
  other: "#71717a",
};

export function WeightBreakdown({ data }: { data: WeightData }) {
  const total = Math.max(1, data.totalBytes);

  return (
    <div className="space-y-4">
      {data.estimatedCompressionSavings > 0 && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Up to {fmtBytes(data.estimatedCompressionSavings)} could be saved by compressing text resources (gzip or brotli).
        </p>
      )}

      {/* Stacked category bar */}
      <div>
        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-zinc-800">
          {data.byCategory.map((c) =>
            c.bytes > 0 ? (
              <div
                key={c.category}
                style={{ width: `${(c.bytes / total) * 100}%`, background: CATEGORY_COLOR[c.category] }}
                title={`${c.category}: ${fmtBytes(c.bytes)} (${c.count} requests)`}
              />
            ) : null,
          )}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
          {data.byCategory.map((c) => (
            <li key={c.category} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: CATEGORY_COLOR[c.category] }} />
              {c.category} <span className="tabular-nums text-zinc-500">{fmtBytes(c.bytes)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Per-domain */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">By domain</h3>
          <ul className="space-y-1.5">
            {data.byDomain.slice(0, 8).map((d) => (
              <li key={d.domain} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-xs text-zinc-300" title={d.domain}>{d.domain}</span>
                    <span className="shrink-0 tabular-nums text-xs text-zinc-400">{fmtBytes(d.bytes)}</span>
                  </div>
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-zinc-500" style={{ width: `${(d.bytes / total) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Biggest offenders */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Biggest requests</h3>
          <ul className="space-y-1.5">
            {data.biggestOffenders.slice(0, 8).map((r) => (
              <li key={r.index} className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-xs text-zinc-300" title={`${r.host}${r.path}`}>
                  {r.path === "/" ? r.host : r.path}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-zinc-400">{fmtBytes(r.sizes.transferBytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
