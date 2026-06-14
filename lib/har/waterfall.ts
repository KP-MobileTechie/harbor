// ---------------------------------------------------------------------------
// waterfall.ts — timeline geometry for the request waterfall. Pure.
// criticalPath and renderBlocking are documented heuristics: HAR carries no
// dependency edges, so they are estimates, not a true critical path.
// ---------------------------------------------------------------------------

import type { HarRequest, ParseResult } from "./types";

export interface WaterfallRow {
  req: HarRequest;
  offsetMs: number;
  endMs: number;
}

export interface Waterfall {
  rows: WaterfallRow[];
  pageLoadMs: number;
  slowest: HarRequest[];
  renderBlocking: HarRequest[];
  criticalPathMs: number;
}

export function buildWaterfall(p: ParseResult): Waterfall {
  const rows: WaterfallRow[] = p.entries.map((req) => ({
    req,
    offsetMs: req.startedMs,
    endMs: req.startedMs + req.timings.total,
  }));

  const pageLoadMs = p.onLoadMs ?? (rows.length ? Math.max(...rows.map((r) => r.endMs)) : 0);
  const slowest = [...p.entries].sort((a, b) => b.timings.total - a.timings.total).slice(0, 10);

  // Heuristic: stylesheets / scripts that finish before the document response does.
  const doc = p.entries.find((r) => r.mimeCategory === "document");
  const docEnd = doc ? doc.startedMs + doc.timings.total : 0;
  const renderBlocking = p.entries.filter(
    (r) => (r.mimeCategory === "stylesheet" || r.mimeCategory === "script") && r.startedMs + r.timings.total <= docEnd + 1,
  );

  const criticalPathMs = rows.filter((r) => !r.req.isThirdParty).reduce((m, r) => Math.max(m, r.endMs), 0);

  return { rows, pageLoadMs, slowest, renderBlocking, criticalPathMs };
}
