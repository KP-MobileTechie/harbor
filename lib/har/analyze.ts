// ---------------------------------------------------------------------------
// analyze.ts — orchestrate the analysis modules into one Analysis object plus
// summary stats. Pure and deterministic; extended additively in later phases
// (audit, security, caching, protocol).
// ---------------------------------------------------------------------------

import type { ParseResult } from "./types";
import { buildWaterfall, type Waterfall } from "./waterfall";
import { analyzeWeight, type WeightBreakdown } from "./weight";
import { analyzeThirdParties, type ThirdParty } from "./thirdparty";
import { scanPrivacy, type PrivacyFinding } from "./privacy";
import { audit, type AuditResult } from "./audit";

export interface Summary {
  totalRequests: number;
  totalTransferBytes: number;
  pageLoadMs: number;
  ttfbMs: number;
  errors: number;
  cacheHitRatio: number;
  firstPartyBytes: number;
  thirdPartyBytes: number;
}

export interface Analysis {
  summary: Summary;
  waterfall: Waterfall;
  weight: WeightBreakdown;
  thirdParties: ThirdParty[];
  privacy: PrivacyFinding[];
  audit: AuditResult;
}

export function analyze(p: ParseResult): Analysis {
  const waterfall = buildWaterfall(p);
  const weight = analyzeWeight(p);
  const doc = p.entries.find((r) => r.mimeCategory === "document");
  const cached = p.entries.filter((r) => r.fromCache).length;

  const partial = {
    summary: {
      totalRequests: p.total,
      totalTransferBytes: weight.totalBytes,
      pageLoadMs: waterfall.pageLoadMs,
      ttfbMs: doc
        ? doc.timings.blocked + doc.timings.dns + doc.timings.connect + doc.timings.ssl + doc.timings.send + doc.timings.wait
        : 0,
      errors: p.errors,
      cacheHitRatio: p.total ? cached / p.total : 0,
      firstPartyBytes: weight.firstPartyBytes,
      thirdPartyBytes: weight.thirdPartyBytes,
    },
    waterfall,
    weight,
    thirdParties: analyzeThirdParties(p),
    privacy: scanPrivacy(p),
  };

  // audit reads only summary/weight/waterfall/thirdParties, so the cast is safe
  // before the audit field exists. The runtime import is one-directional
  // (audit.ts imports the Analysis TYPE only, erased at compile time): no cycle.
  const auditResult = audit(partial as Analysis);

  return { ...partial, audit: auditResult };
}
