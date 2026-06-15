// ---------------------------------------------------------------------------
// sample.ts — a small library of realistic HAR captures so visitors can try
// Harbor instantly from the empty state. Each sample is generated
// deterministically from a FIXED base time (no Date.now / no random), so the
// analysis is stable across reloads and tests. Every HAR matches the shape
// parse.ts reads (log.entries[].request/response/timings/cache, log.pages[0]).
// ---------------------------------------------------------------------------

export interface Sample {
  id: string;
  name: string;
  label: string;
  description: string;
  make: () => string;
}

// Fixed capture base. All timestamps derive from this; never Date.now().
const BASE = Date.parse("2026-02-01T00:00:00.000Z");

interface EntryOpts {
  offsetMs: number;
  url: string;
  method?: string;
  status?: number;
  statusText?: string;
  httpVersion?: string;
  mimeType?: string;
  bodySize?: number;
  transferSize?: number;
  reqHeaders?: { name: string; value: string }[];
  resHeaders?: { name: string; value: string }[];
  queryString?: { name: string; value: string }[];
  timings?: { blocked?: number; dns?: number; connect?: number; ssl?: number; send?: number; wait?: number; receive?: number };
  cached?: boolean;
}

function entry(o: EntryOpts) {
  const t = o.timings ?? { blocked: 1, dns: 2, connect: 3, ssl: 1, send: 1, wait: 40, receive: 8 };
  return {
    startedDateTime: new Date(BASE + o.offsetMs).toISOString(),
    request: {
      method: o.method ?? "GET",
      url: o.url,
      httpVersion: o.httpVersion ?? "h2",
      headers: o.reqHeaders ?? [],
      queryString: o.queryString ?? [],
      cookies: [],
    },
    response: {
      status: o.status ?? 200,
      statusText: o.statusText ?? "OK",
      httpVersion: o.httpVersion ?? "h2",
      content: { mimeType: o.mimeType ?? "text/html", size: o.bodySize ?? 0 },
      headers: o.resHeaders ?? [],
      cookies: [],
      _transferSize: o.transferSize ?? o.bodySize ?? 0,
      headersSize: 200,
      redirectURL: "",
    },
    timings: {
      blocked: t.blocked ?? 1,
      dns: t.dns ?? 0,
      connect: t.connect ?? 0,
      ssl: t.ssl ?? 0,
      send: t.send ?? 0,
      wait: t.wait ?? 20,
      receive: t.receive ?? 5,
    },
    cache: o.cached ? { afterRequest: { eTag: "deterministic", lastFetched: new Date(BASE).toISOString() } } : {},
  };
}

// ---------------------------------------------------------------------------
// (a) Slow, third-party-heavy page: many requests, analytics + ads + tag
// manager, uncompressed text assets, a leaked Bearer token and an email in a
// query string. Produces high request count, multiple third parties, and
// secret + PII + tracker privacy findings.
// ---------------------------------------------------------------------------
function slowBloatedPage(): string {
  const entries: ReturnType<typeof entry>[] = [];
  let off = 0;
  const step = () => (off += 120);

  // First-party document, served uncompressed (no content-encoding) and heavy.
  entries.push(
    entry({
      offsetMs: step(),
      url: "https://shop.example.com/",
      mimeType: "text/html",
      bodySize: 48000,
      transferSize: 48600,
      resHeaders: [{ name: "content-type", value: "text/html" }],
      timings: { blocked: 4, dns: 12, connect: 20, ssl: 18, send: 2, wait: 320, receive: 60 },
    })
  );

  // Several uncompressed first-party scripts and stylesheets (compression savings fire).
  for (let i = 0; i < 6; i++) {
    entries.push(
      entry({
        offsetMs: step(),
        url: `https://shop.example.com/assets/bundle-${i}.js`,
        mimeType: "application/javascript",
        bodySize: 90000 + i * 15000,
        transferSize: 90000 + i * 15000,
        resHeaders: [{ name: "content-type", value: "application/javascript" }],
        timings: { blocked: 6, dns: 0, connect: 0, ssl: 0, send: 1, wait: 90, receive: 120 },
      })
    );
  }
  for (let i = 0; i < 3; i++) {
    entries.push(
      entry({
        offsetMs: step(),
        url: `https://shop.example.com/assets/styles-${i}.css`,
        mimeType: "text/css",
        bodySize: 40000 + i * 8000,
        transferSize: 40000 + i * 8000,
        resHeaders: [{ name: "content-type", value: "text/css" }],
        timings: { blocked: 5, dns: 0, connect: 0, ssl: 0, send: 1, wait: 70, receive: 40 },
      })
    );
  }

  // First-party XHR carrying a Bearer token in the Authorization header (secret).
  entries.push(
    entry({
      offsetMs: step(),
      url: "https://shop.example.com/api/account",
      mimeType: "application/json",
      bodySize: 3000,
      transferSize: 3200,
      reqHeaders: [
        { name: "authorization", value: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.s3cr3tSignatureValue123" },
        { name: "cookie", value: "sid=abc123" },
      ],
      resHeaders: [{ name: "content-type", value: "application/json" }],
      timings: { blocked: 2, dns: 0, connect: 0, ssl: 0, send: 1, wait: 180, receive: 12 },
    })
  );

  // First-party request leaking an email in the query string (PII).
  entries.push(
    entry({
      offsetMs: step(),
      url: "https://shop.example.com/api/profile?email=jane.doe@example.com",
      mimeType: "application/json",
      bodySize: 1200,
      transferSize: 1400,
      queryString: [{ name: "email", value: "jane.doe@example.com" }],
      resHeaders: [{ name: "content-type", value: "application/json" }],
      timings: { blocked: 2, dns: 0, connect: 0, ssl: 0, send: 1, wait: 90, receive: 6 },
    })
  );

  // Google Tag Manager (tag-manager).
  entries.push(
    entry({
      offsetMs: step(),
      url: "https://www.googletagmanager.com/gtm.js?id=GTM-ABCDEF",
      mimeType: "application/javascript",
      bodySize: 110000,
      transferSize: 42000,
      queryString: [{ name: "id", value: "GTM-ABCDEF" }],
      resHeaders: [{ name: "content-encoding", value: "br" }, { name: "content-type", value: "application/javascript" }],
      timings: { blocked: 8, dns: 25, connect: 40, ssl: 30, send: 2, wait: 210, receive: 80 },
    })
  );

  // Google Analytics collect beacons (analytics tracker findings + cookies).
  for (let i = 0; i < 5; i++) {
    entries.push(
      entry({
        offsetMs: step(),
        url: `https://www.google-analytics.com/g/collect?v=2&tid=G-XYZ&en=page_view&seq=${i}`,
        method: "POST",
        mimeType: "image/gif",
        bodySize: 35,
        transferSize: 320,
        reqHeaders: [{ name: "cookie", value: "_ga=GA1.2.123.456" }],
        queryString: [{ name: "v", value: "2" }, { name: "tid", value: "G-XYZ" }, { name: "seq", value: String(i) }],
        timings: { blocked: 3, dns: 0, connect: 0, ssl: 0, send: 1, wait: 60, receive: 2 },
      })
    );
  }

  // DoubleClick ad requests (ads tracker findings).
  for (let i = 0; i < 4; i++) {
    entries.push(
      entry({
        offsetMs: step(),
        url: `https://googleads.g.doubleclick.net/pagead/viewthroughconversion/${1000 + i}`,
        mimeType: "image/gif",
        bodySize: 42,
        transferSize: 410,
        reqHeaders: [{ name: "cookie", value: "IDE=ad-cookie-value" }],
        timings: { blocked: 5, dns: 18, connect: 22, ssl: 20, send: 1, wait: 140, receive: 3 },
      })
    );
  }

  // Web fonts from gstatic (fonts third party).
  for (let i = 0; i < 2; i++) {
    entries.push(
      entry({
        offsetMs: step(),
        url: `https://fonts.gstatic.com/s/roboto/v30/font-${i}.woff2`,
        mimeType: "font/woff2",
        bodySize: 28000,
        transferSize: 28200,
        timings: { blocked: 4, dns: 14, connect: 18, ssl: 16, send: 1, wait: 50, receive: 30 },
      })
    );
  }

  // A scatter of first-party product images to push the request count higher.
  for (let i = 0; i < 14; i++) {
    entries.push(
      entry({
        offsetMs: step(),
        url: `https://shop.example.com/img/product-${i}.jpg`,
        mimeType: "image/jpeg",
        bodySize: 60000 + (i % 5) * 12000,
        transferSize: 60000 + (i % 5) * 12000,
        timings: { blocked: 6, dns: 0, connect: 0, ssl: 0, send: 1, wait: 70 + i * 4, receive: 90 },
      })
    );
  }

  // A couple of failures to make the error count meaningful.
  entries.push(
    entry({
      offsetMs: step(),
      url: "https://shop.example.com/api/recommendations",
      mimeType: "application/json",
      status: 503,
      statusText: "Service Unavailable",
      bodySize: 0,
      transferSize: 180,
      timings: { blocked: 2, dns: 0, connect: 0, ssl: 0, send: 1, wait: 5000, receive: 1 },
    })
  );

  const har = {
    log: {
      version: "1.2",
      creator: { name: "harbor-sample", version: "1" },
      pages: [
        {
          startedDateTime: new Date(BASE).toISOString(),
          id: "page_1",
          title: "https://shop.example.com/",
          pageTimings: { onContentLoad: 2400, onLoad: 6800 },
        },
      ],
      entries,
    },
  };
  return JSON.stringify(har, null, 2);
}

// ---------------------------------------------------------------------------
// (b) Lean, optimized page: few requests, all compressed (br/gzip), HTTP/3,
// most assets served from cache (high cache-hit ratio), no trackers and no
// leaked secrets or PII. Produces a small, clean analysis.
// ---------------------------------------------------------------------------
function leanOptimizedPage(): string {
  const entries: ReturnType<typeof entry>[] = [];
  let off = 0;
  const step = () => (off += 80);

  entries.push(
    entry({
      offsetMs: step(),
      url: "https://fast.example.dev/",
      httpVersion: "h3",
      mimeType: "text/html",
      bodySize: 9000,
      transferSize: 3200,
      resHeaders: [{ name: "content-encoding", value: "br" }, { name: "content-type", value: "text/html" }],
      timings: { blocked: 1, dns: 2, connect: 4, ssl: 3, send: 1, wait: 38, receive: 6 },
    })
  );

  entries.push(
    entry({
      offsetMs: step(),
      url: "https://fast.example.dev/app.js",
      httpVersion: "h3",
      mimeType: "application/javascript",
      bodySize: 22000,
      transferSize: 7800,
      resHeaders: [{ name: "content-encoding", value: "br" }, { name: "content-type", value: "application/javascript" }],
      timings: { blocked: 1, dns: 0, connect: 0, ssl: 0, send: 1, wait: 22, receive: 9 },
    })
  );

  entries.push(
    entry({
      offsetMs: step(),
      url: "https://fast.example.dev/styles.css",
      httpVersion: "h3",
      mimeType: "text/css",
      bodySize: 7000,
      transferSize: 2400,
      resHeaders: [{ name: "content-encoding", value: "br" }, { name: "content-type", value: "text/css" }],
      timings: { blocked: 1, dns: 0, connect: 0, ssl: 0, send: 1, wait: 18, receive: 5 },
    })
  );

  // Cached assets: transferSize 0 + cache.afterRequest => fromCache true.
  for (let i = 0; i < 5; i++) {
    entries.push(
      entry({
        offsetMs: step(),
        url: `https://fast.example.dev/img/icon-${i}.webp`,
        httpVersion: "h3",
        mimeType: "image/webp",
        bodySize: 5000 + i * 500,
        transferSize: 0,
        cached: true,
        resHeaders: [{ name: "cache-control", value: "public, max-age=31536000, immutable" }],
        timings: { blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: 1, receive: 0 },
      })
    );
  }

  // One self-hosted, compressed, cached font — still first party, no trackers.
  entries.push(
    entry({
      offsetMs: step(),
      url: "https://fast.example.dev/fonts/inter.woff2",
      httpVersion: "h3",
      mimeType: "font/woff2",
      bodySize: 18000,
      transferSize: 0,
      cached: true,
      resHeaders: [{ name: "cache-control", value: "public, max-age=31536000, immutable" }],
      timings: { blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: 1, receive: 0 },
    })
  );

  const har = {
    log: {
      version: "1.2",
      creator: { name: "harbor-sample", version: "1" },
      pages: [
        {
          startedDateTime: new Date(BASE).toISOString(),
          id: "page_1",
          title: "https://fast.example.dev/",
          pageTimings: { onContentLoad: 220, onLoad: 480 },
        },
      ],
      entries,
    },
  };
  return JSON.stringify(har, null, 2);
}

export const SAMPLES: Sample[] = [
  {
    id: "slow",
    name: "slow-bloated-page.har",
    label: "Slow, tracker-heavy page",
    description: "Many requests, analytics and ad trackers, uncompressed assets, and a leaked token and email",
    make: slowBloatedPage,
  },
  {
    id: "lean",
    name: "lean-optimized-page.har",
    label: "Lean, optimized page",
    description: "Few requests, all compressed over HTTP/3, mostly cached, with no third-party trackers",
    make: leanOptimizedPage,
  },
];

// Convenience export used by other tests.
export const SAMPLE_HAR = SAMPLES[0].make();
