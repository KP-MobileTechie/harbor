// ---------------------------------------------------------------------------
// weight.ts — aggregate transfer bytes by resource category and by domain,
// split first vs third party, and estimate compression savings for text
// resources served uncompressed. Pure and deterministic.
// ---------------------------------------------------------------------------

import type { HarRequest, MimeCategory, ParseResult } from "./types";

export interface WeightBreakdown {
  totalBytes: number;
  firstPartyBytes: number;
  thirdPartyBytes: number;
  byCategory: { category: MimeCategory; bytes: number; count: number }[];
  byDomain: { domain: string; bytes: number; count: number }[];
  biggestOffenders: HarRequest[];
  estimatedCompressionSavings: number;
}

const TEXT: MimeCategory[] = ["document", "script", "stylesheet", "xhr"];

export function analyzeWeight(p: ParseResult): WeightBreakdown {
  const cat = new Map<MimeCategory, { bytes: number; count: number }>();
  const dom = new Map<string, { bytes: number; count: number }>();
  let total = 0;
  let first = 0;
  let third = 0;
  let savings = 0;

  for (const r of p.entries) {
    const b = r.sizes.transferBytes;
    total += b;
    if (r.isThirdParty) third += b;
    else first += b;

    const c = cat.get(r.mimeCategory) ?? { bytes: 0, count: 0 };
    c.bytes += b;
    c.count++;
    cat.set(r.mimeCategory, c);

    const d = dom.get(r.registrableDomain) ?? { bytes: 0, count: 0 };
    d.bytes += b;
    d.count++;
    dom.set(r.registrableDomain, d);

    const enc = r.resHeaders.find((h) => h.name.toLowerCase() === "content-encoding")?.value ?? "";
    if (TEXT.includes(r.mimeCategory) && !/gzip|br|deflate/i.test(enc) && r.sizes.bodyBytes > 1000) {
      savings += Math.round(r.sizes.bodyBytes * 0.7);
    }
  }

  return {
    totalBytes: total,
    firstPartyBytes: first,
    thirdPartyBytes: third,
    byCategory: [...cat.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.bytes - a.bytes),
    byDomain: [...dom.entries()].map(([domain, v]) => ({ domain, ...v })).sort((a, b) => b.bytes - a.bytes),
    biggestOffenders: [...p.entries].sort((a, b) => b.sizes.transferBytes - a.sizes.transferBytes).slice(0, 10),
    estimatedCompressionSavings: savings,
  };
}
