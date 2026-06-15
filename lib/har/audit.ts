// ---------------------------------------------------------------------------
// audit.ts — deterministic recommendations engine. Turns an Analysis into a
// ranked list of actionable recommendations using only data already computed by
// the analysis modules (no AI, no network). Pure and deterministic: the same
// Analysis always yields byte-identical results.
//
// AuditResult is intentionally an object (not a bare array) so Task 2.2 can add
// `score` and `budgets` fields without breaking callers.
// ---------------------------------------------------------------------------

import type { Analysis } from "./analyze";
import type { Severity } from "./privacy";

export interface Recommendation {
  id: string; // stable kebab id, e.g. "uncompressed-text"
  title: string; // short imperative
  detail: string; // human sentence citing concrete figures (KB, count, ms)
  severity: Severity; // high | medium | low
  impact: number; // numeric magnitude for sorting (bytes or ms saved, or a derived score)
  count: number; // how many requests/items this applies to
}

export interface AuditResult {
  recommendations: Recommendation[];
}

const KB = 1024;
const MB = 1024 * 1024;

function kb(bytes: number): string {
  return `${Math.round(bytes / KB)} KB`;
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function audit(analysis: Analysis): AuditResult {
  const { summary, waterfall, weight, thirdParties } = analysis;
  const recs: Recommendation[] = [];

  // 1. uncompressed-text — text resources served without gzip/br/deflate.
  const savings = weight.estimatedCompressionSavings;
  if (savings > KB) {
    // Count uncompressed text requests where weight credits a saving (body > 1000
    // and no content-encoding). Mirrors weight.ts so the figure is consistent.
    const TEXT = new Set(["document", "script", "stylesheet", "xhr"]);
    // Count uncompressed text requests among the biggest offenders (the only
    // per-request data the Analysis exposes). Falls back to 1 if none surface.
    const count =
      weight.biggestOffenders.filter(
        (r) =>
          TEXT.has(r.mimeCategory) &&
          r.sizes.bodyBytes > 1000 &&
          !/gzip|br|deflate/i.test(r.resHeaders.find((h) => h.name.toLowerCase() === "content-encoding")?.value ?? ""),
      ).length || 1;
    recs.push({
      id: "uncompressed-text",
      title: "Enable text compression",
      detail: `Text resources are served uncompressed. Enabling gzip or brotli could save about ${kb(savings)}.`,
      severity: savings > 100 * KB ? "high" : "medium",
      impact: savings,
      count,
    });
  }

  // 2. render-blocking — scripts/stylesheets that complete before the document.
  const rb = waterfall.renderBlocking.length;
  if (rb > 0) {
    recs.push({
      id: "render-blocking",
      title: "Reduce render-blocking resources",
      detail: `${rb} script or stylesheet ${rb === 1 ? "request blocks" : "requests block"} initial render. Defer, async, or inline critical resources.`,
      severity: rb > 3 ? "high" : "medium",
      impact: rb * 50, // count-derived magnitude (rough ms saved per blocker)
      count: rb,
    });
  }

  // 3. too-many-requests — request count beyond a reasonable budget.
  const total = summary.totalRequests;
  if (total > 50) {
    recs.push({
      id: "too-many-requests",
      title: "Reduce the number of requests",
      detail: `The page makes ${total} requests. Bundle, inline, or lazy-load assets to cut round trips.`,
      severity: total > 100 ? "high" : "medium",
      impact: total,
      count: total,
    });
  }

  // 4. heavy-third-parties — third-party transfer weight over 512KB.
  const tpBytes = summary.thirdPartyBytes;
  if (tpBytes > 512 * KB) {
    recs.push({
      id: "heavy-third-parties",
      title: "Trim third-party weight",
      detail: `Third-party requests transfer about ${kb(tpBytes)} across ${thirdParties.length} ${thirdParties.length === 1 ? "domain" : "domains"}. Audit and remove non-essential scripts.`,
      severity: tpBytes > MB ? "high" : "medium",
      impact: tpBytes,
      count: thirdParties.length,
    });
  }

  // 5. large-images — individual images over 200KB on the wire.
  const bigImages = weight.biggestOffenders.filter(
    (r) => r.mimeCategory === "image" && r.sizes.transferBytes > 200 * KB,
  );
  if (bigImages.length > 0) {
    const imgBytes = bigImages.reduce((s, r) => s + r.sizes.transferBytes, 0);
    recs.push({
      id: "large-images",
      title: "Optimize large images",
      detail: `${bigImages.length} ${bigImages.length === 1 ? "image is" : "images are"} over 200 KB, totaling about ${kb(imgBytes)}. Compress, resize, or serve modern formats like WebP or AVIF.`,
      severity: imgBytes > MB ? "medium" : "low",
      impact: imgBytes,
      count: bigImages.length,
    });
  }

  // 6. errors-present — failed requests (4xx/5xx) in the capture.
  const errors = summary.errors;
  if (errors > 0) {
    recs.push({
      id: "errors-present",
      title: "Fix failed requests",
      detail: `${errors} ${errors === 1 ? "request returned" : "requests returned"} an error status. Failed requests waste bandwidth and can break functionality.`,
      severity: "high",
      impact: errors * 1000, // scaled so errors rank meaningfully against byte impacts
      count: errors,
    });
  }

  // missing-cache rule deferred: Phase 4 (caching analysis) supplies the
  // freshness/max-age data this recommendation needs. Not implemented yet.

  // Sort by severity (high > medium > low), then impact descending. Stable:
  // equal keys keep insertion order via index tie-break.
  const indexed = recs.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    const s = SEVERITY_RANK[a.r.severity] - SEVERITY_RANK[b.r.severity];
    if (s !== 0) return s;
    const imp = b.r.impact - a.r.impact;
    if (imp !== 0) return imp;
    return a.i - b.i;
  });

  return { recommendations: indexed.map((x) => x.r) };
}
