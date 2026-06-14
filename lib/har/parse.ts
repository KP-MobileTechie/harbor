// ---------------------------------------------------------------------------
// parse.ts — validate a HAR file and normalize every entry into the Harbor
// request model. Pure and deterministic; tolerant of missing optional fields.
// ---------------------------------------------------------------------------

import type { HarRequest, HeaderKV, MimeCategory, ParseResult, Timings } from "./types";

// A small set of common multi-part public suffixes so registrableDomain returns
// eTLD+1 (example.co.uk, not co.uk). Not exhaustive: covers the frequent cases.
const MULTI_SUFFIX = new Set(["co.uk", "com.au", "co.jp", "co.in", "com.br", "co.nz", "org.uk", "ac.uk"]);

export function registrableDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_SUFFIX.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

export function mimeCategoryOf(mime: string, url: string): MimeCategory {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("text/html") || m.includes("xhtml")) return "document";
  if (m.includes("javascript") || /\.m?js(\?|$)/.test(url)) return "script";
  if (m.includes("css")) return "stylesheet";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("font/") || /\.(woff2?|ttf|otf|eot)(\?|$)/.test(url)) return "font";
  if (m.startsWith("video/") || m.startsWith("audio/")) return "media";
  if (m.includes("json") || m.includes("xml") || m.includes("x-www-form")) return "xhr";
  return "other";
}

export function normalizeTimings(raw: Partial<Record<keyof Timings, number>> = {}): Timings {
  const c = (n?: number) => (typeof n === "number" && n > 0 ? n : 0);
  const t: Timings = {
    blocked: c(raw.blocked),
    dns: c(raw.dns),
    connect: c(raw.connect),
    ssl: c(raw.ssl),
    send: c(raw.send),
    wait: c(raw.wait),
    receive: c(raw.receive),
    total: 0,
  };
  t.total = t.blocked + t.dns + t.connect + t.ssl + t.send + t.wait + t.receive;
  return t;
}

interface RawHeader {
  name?: string;
  value?: string;
}

export function headerMap(headers: RawHeader[] = []): HeaderKV[] {
  return headers.filter((x) => x?.name).map((x) => ({ name: String(x.name), value: String(x.value ?? "") }));
}

export function parseHar(text: string): ParseResult {
  let root: { log?: { entries?: unknown[]; pages?: unknown[] } };
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON.");
  }
  const log = root?.log;
  if (!log || !Array.isArray(log.entries)) {
    throw new Error("File is not a valid HAR (missing log.entries).");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawEntries = log.entries as any[];

  const startTimes = rawEntries.map((e) => Date.parse(e?.startedDateTime)).filter((n) => !Number.isNaN(n));
  const startedMs = startTimes.length ? Math.min(...startTimes) : 0;

  const hostCount = new Map<string, number>();
  const entries: HarRequest[] = rawEntries.map((e, index) => {
    const url: string = e?.request?.url ?? "";
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      u = new URL("https://invalid.local/");
    }
    hostCount.set(u.hostname, (hostCount.get(u.hostname) ?? 0) + 1);

    const status = Number(e?.response?.status ?? 0);
    const bodyBytes = Math.max(0, Number(e?.response?.content?.size ?? 0));
    const transfer = Number(e?.response?._transferSize);
    const headersBytes = Math.max(0, Number(e?.response?.headersSize ?? 0));
    const resHeaders = headerMap(e?.response?.headers);
    const started = Date.parse(e?.startedDateTime);

    return {
      index,
      startedMs: (Number.isNaN(started) ? startedMs : started) - startedMs,
      url,
      scheme: u.protocol.replace(":", ""),
      host: u.hostname,
      registrableDomain: registrableDomain(u.hostname),
      path: u.pathname,
      method: e?.request?.method ?? "GET",
      status,
      statusText: e?.response?.statusText ?? "",
      httpVersion: e?.response?.httpVersion ?? "",
      mimeCategory: mimeCategoryOf(e?.response?.content?.mimeType ?? "", url),
      isThirdParty: false, // set below, once the primary domain is known
      fromCache: Boolean(e?.cache && (e.cache.afterRequest || e.cache.beforeRequest)) || transfer === 0,
      timings: normalizeTimings(e?.timings ?? {}),
      sizes: {
        headersBytes,
        bodyBytes,
        transferBytes: Number.isFinite(transfer) && transfer >= 0 ? transfer : bodyBytes,
      },
      reqHeaders: headerMap(e?.request?.headers),
      resHeaders,
      setCookies: resHeaders.filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryParams: (e?.request?.queryString ?? []).map((q: any) => String(q?.name)),
      redirectUrl: e?.response?.redirectURL || undefined,
    };
  });

  // Primary domain: the first entry's host, falling back to the most frequent.
  let primaryHost = entries[0]?.host ?? "";
  if (!primaryHost) {
    let max = -1;
    for (const [h, n] of hostCount) if (n > max) ((max = n), (primaryHost = h));
  }
  const primaryDomain = registrableDomain(primaryHost);
  for (const r of entries) r.isThirdParty = r.registrableDomain !== primaryDomain;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (log.pages as any[] | undefined)?.[0];
  const onContentLoad = Number(page?.pageTimings?.onContentLoad);
  const onLoad = Number(page?.pageTimings?.onLoad);

  return {
    pageUrl: entries[0]?.url ?? "",
    primaryDomain,
    startedMs,
    onContentLoadMs: onContentLoad > 0 ? onContentLoad : undefined,
    onLoadMs: onLoad > 0 ? onLoad : undefined,
    entries,
    total: entries.length,
    errors: entries.filter((r) => r.status === 0 || r.status >= 400).length,
  };
}
