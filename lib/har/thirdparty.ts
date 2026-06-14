// ---------------------------------------------------------------------------
// thirdparty.ts — group third-party requests by registrable domain and classify
// each against a small built-in list of known services. Pure.
// ---------------------------------------------------------------------------

import type { ParseResult } from "./types";

export type TPCategory = "analytics" | "ads" | "tag-manager" | "cdn" | "social" | "fonts" | "unknown";

export interface ThirdParty {
  domain: string;
  category: TPCategory;
  requests: number;
  bytes: number;
  timeMs: number;
  sentCookies: boolean;
  sentQueryParams: boolean;
}

const RULES: [RegExp, TPCategory][] = [
  [/google-analytics|analytics|segment|mixpanel|amplitude|hotjar|plausible/, "analytics"],
  [/doubleclick|adservice|adsystem|adnxs|criteo|taboola|outbrain/, "ads"],
  [/googletagmanager|tagmanager/, "tag-manager"],
  [/cloudflare|akamai|fastly|cloudfront|jsdelivr|unpkg|cdn\./, "cdn"],
  [/facebook|twitter|linkedin|tiktok|instagram/, "social"],
  [/fonts\.(googleapis|gstatic)|typekit|fontawesome/, "fonts"],
];

export function classifyDomain(domain: string): TPCategory {
  for (const [re, cat] of RULES) if (re.test(domain)) return cat;
  return "unknown";
}

export function analyzeThirdParties(p: ParseResult): ThirdParty[] {
  const m = new Map<string, ThirdParty>();
  for (const r of p.entries) {
    if (!r.isThirdParty) continue;
    const tp =
      m.get(r.registrableDomain) ??
      {
        domain: r.registrableDomain,
        category: classifyDomain(r.registrableDomain),
        requests: 0,
        bytes: 0,
        timeMs: 0,
        sentCookies: false,
        sentQueryParams: false,
      };
    tp.requests++;
    tp.bytes += r.sizes.transferBytes;
    tp.timeMs += r.timings.total;
    if (r.reqHeaders.some((h) => h.name.toLowerCase() === "cookie")) tp.sentCookies = true;
    if (r.queryParams.length) tp.sentQueryParams = true;
    m.set(r.registrableDomain, tp);
  }
  return [...m.values()].sort((a, b) => b.bytes - a.bytes);
}
