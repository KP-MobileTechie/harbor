"use client";

// ---------------------------------------------------------------------------
// Waterfall.tsx — render the request timeline. Each row is a horizontal bar
// positioned by its offset from capture start over the total page load time,
// segmented by timing phase (blocked, dns, connect, ssl, send, wait, receive)
// with a distinct color per phase. The slowest requests get a highlight ring.
// Static in Phase 1; row interactivity arrives in Phase 3.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import type { Waterfall as WaterfallData } from "@/lib/har/waterfall";
import type { HarRequest, Timings } from "@/lib/har/types";
import { fmtMs } from "@/lib/format";

// Phase order matches how the request actually unfolds over the wire.
const PHASES: { key: keyof Omit<Timings, "total">; label: string; color: string }[] = [
  { key: "blocked", label: "Blocked", color: "#52525b" },
  { key: "dns", label: "DNS", color: "#71717a" },
  { key: "connect", label: "Connect", color: "#a1a1aa" },
  { key: "ssl", label: "SSL", color: "#d4d4d8" },
  { key: "send", label: "Send", color: "#60a5fa" },
  { key: "wait", label: "Wait (TTFB)", color: "#a78bfa" },
  { key: "receive", label: "Receive", color: "#34d399" },
];

const STATUS_COLOR = (status: number): string => {
  if (status >= 500) return "text-red-400";
  if (status >= 400) return "text-amber-400";
  if (status >= 300) return "text-blue-400";
  return "text-zinc-500";
};

export function Waterfall({ data }: { data: WaterfallData }) {
  const span = Math.max(1, data.pageLoadMs);
  const slowestSet = useMemo(() => new Set(data.slowest.map((r) => r.index)), [data.slowest]);

  if (!data.rows.length) {
    return <p className="text-sm text-zinc-500">No requests to plot.</p>;
  }

  return (
    <div>
      {/* Phase legend */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400">
        {PHASES.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
            {p.label}
          </span>
        ))}
      </div>

      <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
        {data.rows.map((row) => {
          const r = row.req;
          const isSlow = slowestSet.has(r.index);
          const leftPct = (row.offsetMs / span) * 100;
          const title = phaseTitle(r);
          return (
            <div
              key={r.index}
              className={`flex items-center gap-3 border-b border-zinc-900 px-3 py-1.5 last:border-b-0 ${
                isSlow ? "bg-amber-400/5" : ""
              }`}
            >
              {/* Label column */}
              <div className="flex w-56 shrink-0 items-baseline gap-1.5 overflow-hidden">
                <span className={`shrink-0 font-mono text-[10px] tabular-nums ${STATUS_COLOR(r.status)}`}>{r.status}</span>
                <span className="truncate font-mono text-xs text-zinc-300" title={`${r.host}${r.path}`}>
                  {r.path === "/" ? r.host : r.path}
                </span>
              </div>

              {/* Track */}
              <div className="relative h-3.5 flex-1" title={title}>
                <div
                  className={`absolute top-0 flex h-full overflow-hidden rounded-sm ${
                    isSlow ? "ring-1 ring-amber-400/60" : ""
                  }`}
                  style={{ left: `${leftPct}%`, width: `${barWidthPct(r, span)}%`, minWidth: "2px" }}
                >
                  {PHASES.map((p) => {
                    const ms = r.timings[p.key];
                    if (ms <= 0) return null;
                    return (
                      <div
                        key={p.key}
                        style={{ width: `${(ms / Math.max(1, r.timings.total)) * 100}%`, background: p.color }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Duration column */}
              <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-500">
                {fmtMs(r.timings.total)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function barWidthPct(r: HarRequest, span: number): number {
  return Math.min(100, (r.timings.total / span) * 100);
}

function phaseTitle(r: HarRequest): string {
  const parts = PHASES.filter((p) => r.timings[p.key] > 0).map((p) => `${p.label} ${Math.round(r.timings[p.key])}ms`);
  return `${r.host}${r.path}\n${parts.join(" · ")} · total ${Math.round(r.timings.total)}ms`;
}
