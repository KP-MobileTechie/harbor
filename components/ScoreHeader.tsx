"use client";

// ---------------------------------------------------------------------------
// ScoreHeader.tsx — the dashboard hero. A radial gauge renders the 0..100
// performance score and its letter grade, colored by grade band (A/B green,
// C amber, D/F red). Beside it, one chip per budget check shows pass/fail and
// the actual vs limit figure, with units inferred from the budget id (bytes,
// count, or ms). Pure and presentational.
// ---------------------------------------------------------------------------

import type { Score, BudgetCheck } from "@/lib/har/audit";
import { fmtBytes, fmtMs } from "@/lib/format";

// Grade band → gauge + text colors. Tailwind tokens kept inline as hex so the
// SVG stroke and the text stay perfectly in sync.
const GRADE_BAND: Record<Score["grade"], { stroke: string; text: string; ring: string }> = {
  A: { stroke: "#34d399", text: "text-emerald-300", ring: "shadow-emerald-500/20" },
  B: { stroke: "#34d399", text: "text-emerald-300", ring: "shadow-emerald-500/20" },
  C: { stroke: "#fbbf24", text: "text-amber-300", ring: "shadow-amber-500/20" },
  D: { stroke: "#f87171", text: "text-red-300", ring: "shadow-red-500/20" },
  F: { stroke: "#f87171", text: "text-red-300", ring: "shadow-red-500/20" },
};

// Format a budget value for display, inferring units from the budget id.
function fmtBudget(id: string, n: number): string {
  if (id === "total-requests") return n.toLocaleString();
  if (id === "load-ms") return fmtMs(n);
  return fmtBytes(n); // total-bytes, third-party-bytes
}

// SVG geometry. A single circle, dashed to draw only the scored fraction.
const SIZE = 132;
const STROKE = 11;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function Gauge({ score }: { score: Score }) {
  const band = GRADE_BAND[score.grade];
  // Clamp to 0..100 so the arc never produces NaN or overshoots at 0 or 100.
  const pct = Math.max(0, Math.min(100, score.value)) / 100;
  const dash = CIRC * pct;

  return (
    <div className={`relative shrink-0 rounded-full shadow-lg ${band.ring}`} style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden="true">
        {/* Track */}
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#27272a" strokeWidth={STROKE} />
        {/* Scored arc */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={band.stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC - dash}`}
        />
      </svg>
      {/* Centered value + grade, absolutely positioned over the SVG */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold leading-none tabular-nums ${band.text}`}>{score.value}</span>
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Grade <span className={band.text}>{score.grade}</span>
        </span>
      </div>
    </div>
  );
}

export function ScoreHeader({ score, budgets }: { score: Score; budgets: BudgetCheck[] }) {
  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 sm:flex-row sm:items-center">
      <div className="flex items-center gap-5">
        <Gauge score={score} />
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Performance score</h2>
          <p className="mt-1 max-w-xs text-xs text-zinc-500">
            A blended estimate from transfer size, request count, time to first byte, and load time. Higher is better.
          </p>
        </div>
      </div>

      <div className="flex-1 sm:border-l sm:border-zinc-800 sm:pl-6">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Performance budgets</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {budgets.map((b) => {
            const ok = b.pass;
            return (
              <div
                key={b.id}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
                  ok ? "border-emerald-500/25 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    ok ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                  }`}
                  aria-hidden="true"
                >
                  {ok ? "✓" : "✕"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-zinc-200" title={b.label}>
                    {b.label}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-500">
                    <span className={ok ? "text-emerald-300" : "text-red-300"}>{fmtBudget(b.id, b.actual)}</span>
                    <span className="text-zinc-600"> / {fmtBudget(b.id, b.limit)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
