// ---------------------------------------------------------------------------
// privacy.ts — local-only scan for leaked secrets, PII, and tracker requests.
// Evidence is masked so the UI never re-displays a full secret. Pure.
// ---------------------------------------------------------------------------

import type { ParseResult } from "./types";
import { classifyDomain } from "./thirdparty";

export type Severity = "high" | "medium" | "low";

export interface PrivacyFinding {
  severity: Severity;
  kind: "secret" | "pii" | "tracker";
  title: string;
  where: string;
  evidence: string;
}

export function maskSecret(s: string): string {
  return "…" + s.slice(-4);
}

/** Location for a finding: origin + path only, so the query string (where
 *  tokens and emails live) is never stored back into the finding. */
function safeLocation(url: string): string {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).slice(0, 80);
  } catch {
    return url.split("?")[0].slice(0, 80);
  }
}

const JWT = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{2,}/;
const BEARER = /bearer\s+[A-Za-z0-9._-]{10,}/i;
const APIKEY = /(api[_-]?key|secret|token)["'=:\s]+[A-Za-z0-9._-]{12,}/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function scanPrivacy(p: ParseResult): PrivacyFinding[] {
  const out: PrivacyFinding[] = [];
  for (const r of p.entries) {
    const hay = [r.url, ...r.reqHeaders.map((h) => `${h.name}: ${h.value}`)];
    for (const s of hay) {
      const m = s.match(JWT) || s.match(BEARER) || s.match(APIKEY);
      if (m) {
        out.push({ severity: "high", kind: "secret", title: "Token or secret in request", where: safeLocation(r.url), evidence: maskSecret(m[0]) });
        break;
      }
    }
    const em = (r.url + " " + r.queryParams.join(" ")).match(EMAIL);
    if (em) out.push({ severity: "medium", kind: "pii", title: "Email address exposed", where: safeLocation(r.url), evidence: maskSecret(em[0]) });

    if (r.isThirdParty) {
      const cat = classifyDomain(r.registrableDomain);
      if (cat === "ads" || cat === "analytics") {
        out.push({ severity: "low", kind: "tracker", title: `Tracker request to ${r.registrableDomain}`, where: safeLocation(r.url), evidence: r.registrableDomain });
      }
    }
  }
  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
