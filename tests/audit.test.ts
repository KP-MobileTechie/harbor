import { describe, it, expect } from "vitest";
import { audit, score, budgets } from "../lib/har/audit";
import { analyze } from "../lib/har/analyze";
import { parseHar } from "../lib/har/parse";
import { SAMPLES } from "../lib/har/sample";

// Helper: build a HAR from a list of entry descriptors in the shape parse.ts reads.
const BASE = Date.parse("2026-02-01T00:00:00.000Z");
interface E {
  off: number;
  url: string;
  mime?: string;
  status?: number;
  bodySize?: number;
  transferSize?: number;
  resHeaders?: { name: string; value: string }[];
  wait?: number;
  receive?: number;
}
function har(entries: E[]): string {
  return JSON.stringify({
    log: {
      pages: [
        {
          startedDateTime: new Date(BASE).toISOString(),
          id: "page_1",
          title: "https://example.com/",
          pageTimings: { onContentLoad: 100, onLoad: 200 },
        },
      ],
      entries: entries.map((e) => ({
        startedDateTime: new Date(BASE + e.off).toISOString(),
        request: { method: "GET", url: e.url, httpVersion: "h2", headers: [], queryString: [], cookies: [] },
        response: {
          status: e.status ?? 200,
          statusText: "OK",
          httpVersion: "h2",
          content: { mimeType: e.mime ?? "text/html", size: e.bodySize ?? 0 },
          headers: e.resHeaders ?? [],
          cookies: [],
          _transferSize: e.transferSize ?? e.bodySize ?? 0,
          headersSize: 100,
          redirectURL: "",
        },
        timings: { blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: e.wait ?? 10, receive: e.receive ?? 1 },
        cache: {},
      })),
    },
  });
}

const ids = (r: ReturnType<typeof audit>) => r.recommendations.map((x) => x.id);

describe("audit — single-rule minimal captures", () => {
  it("fires uncompressed-text when text assets are served without compression", () => {
    const a = analyze(
      parseHar(
        har([
          { off: 0, url: "https://example.com/", mime: "text/html", bodySize: 60000, transferSize: 60000 },
          { off: 50, url: "https://example.com/app.js", mime: "application/javascript", bodySize: 200000, transferSize: 200000 },
        ])
      )
    );
    const r = audit(a);
    expect(ids(r)).toContain("uncompressed-text");
    const rec = r.recommendations.find((x) => x.id === "uncompressed-text")!;
    expect(rec.impact).toBe(a.weight.estimatedCompressionSavings);
    expect(rec.severity).toBe("high"); // > 100KB savings
  });

  it("does not fire uncompressed-text when assets are compressed", () => {
    const a = analyze(
      parseHar(
        har([
          {
            off: 0,
            url: "https://example.com/",
            mime: "text/html",
            bodySize: 60000,
            transferSize: 20000,
            resHeaders: [{ name: "content-encoding", value: "br" }],
          },
        ])
      )
    );
    expect(ids(audit(a))).not.toContain("uncompressed-text");
  });

  it("fires too-many-requests above 50 requests", () => {
    const entries: E[] = [];
    for (let i = 0; i < 60; i++) entries.push({ off: i * 10, url: `https://example.com/r${i}`, mime: "image/png", bodySize: 100, transferSize: 100 });
    const a = analyze(parseHar(har(entries)));
    const r = audit(a);
    expect(ids(r)).toContain("too-many-requests");
    expect(r.recommendations.find((x) => x.id === "too-many-requests")!.count).toBe(60);
  });

  it("fires heavy-third-parties above 512KB of third-party bytes", () => {
    const a = analyze(
      parseHar(
        har([
          { off: 0, url: "https://example.com/", mime: "text/html", bodySize: 1000, transferSize: 1000 },
          { off: 50, url: "https://cdn.other.com/big.js", mime: "application/javascript", bodySize: 700000, transferSize: 700000, resHeaders: [{ name: "content-encoding", value: "br" }] },
        ])
      )
    );
    expect(ids(audit(a))).toContain("heavy-third-parties");
  });

  it("fires large-images for big image transfers", () => {
    const a = analyze(
      parseHar(
        har([
          { off: 0, url: "https://example.com/", mime: "text/html", bodySize: 1000, transferSize: 1000 },
          { off: 50, url: "https://example.com/hero.jpg", mime: "image/jpeg", bodySize: 400000, transferSize: 400000 },
        ])
      )
    );
    const r = audit(a);
    expect(ids(r)).toContain("large-images");
    expect(r.recommendations.find((x) => x.id === "large-images")!.count).toBe(1);
  });

  it("fires errors-present when there are failed requests", () => {
    const a = analyze(
      parseHar(
        har([
          { off: 0, url: "https://example.com/", mime: "text/html", bodySize: 1000, transferSize: 1000 },
          { off: 50, url: "https://example.com/missing", mime: "application/json", status: 404, transferSize: 100 },
        ])
      )
    );
    const r = audit(a);
    expect(ids(r)).toContain("errors-present");
    expect(r.recommendations.find((x) => x.id === "errors-present")!.severity).toBe("high");
  });

  it("fires render-blocking when scripts/styles complete before the document does", () => {
    const a = analyze(
      parseHar(
        har([
          { off: 0, url: "https://example.com/", mime: "text/html", bodySize: 1000, transferSize: 1000, wait: 500, receive: 50 },
          { off: 10, url: "https://example.com/a.css", mime: "text/css", bodySize: 1000, transferSize: 1000, wait: 20, receive: 1 },
          { off: 20, url: "https://example.com/b.js", mime: "application/javascript", bodySize: 1000, transferSize: 1000, wait: 20, receive: 1 },
        ])
      )
    );
    const r = audit(a);
    expect(a.waterfall.renderBlocking.length).toBeGreaterThan(0);
    expect(ids(r)).toContain("render-blocking");
  });
});

describe("audit — sample captures", () => {
  it("the slow bloated sample fires several rules", () => {
    const a = analyze(parseHar(SAMPLES.find((s) => s.id === "slow")!.make()));
    const got = ids(audit(a));
    // The slow sample has ~39 requests (under the 50 threshold) and its images
    // top out near 108 KB (under the 200 KB threshold), so too-many-requests
    // and large-images do not fire. The bloat instead surfaces as uncompressed
    // text, render-blocking resources, and a failed request.
    for (const id of ["uncompressed-text", "render-blocking", "errors-present"]) {
      expect(got).toContain(id);
    }
  });

  it("the lean optimized sample fires none of the bloat rules", () => {
    const a = analyze(parseHar(SAMPLES.find((s) => s.id === "lean")!.make()));
    const got = ids(audit(a));
    for (const id of ["uncompressed-text", "too-many-requests", "heavy-third-parties", "large-images", "errors-present"]) {
      expect(got).not.toContain(id);
    }
  });
});

describe("audit — sorting and determinism", () => {
  it("sorts high-severity recommendations before lower ones, impact descending within a severity", () => {
    const a = analyze(parseHar(SAMPLES.find((s) => s.id === "slow")!.make()));
    const recs = audit(a).recommendations;
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < recs.length; i++) {
      const prev = recs[i - 1];
      const cur = recs[i];
      expect(rank[prev.severity]).toBeLessThanOrEqual(rank[cur.severity]);
      if (prev.severity === cur.severity) {
        expect(prev.impact).toBeGreaterThanOrEqual(cur.impact);
      }
    }
  });

  it("is deterministic: two runs over the same analysis are identical", () => {
    const a = analyze(parseHar(SAMPLES.find((s) => s.id === "slow")!.make()));
    expect(audit(a)).toEqual(audit(a));
  });
});

describe("audit — performance score", () => {
  const slow = () => analyze(parseHar(SAMPLES.find((s) => s.id === "slow")!.make()));
  const lean = () => analyze(parseHar(SAMPLES.find((s) => s.id === "lean")!.make()));

  it("scores the lean optimized sample high (A/B, value >= 75)", () => {
    const sc = score(lean());
    // All four metrics sit at or below their 'good' reference, so each
    // sub-score clamps to 100 and the blend is a perfect 100.
    expect(sc.value).toBe(100);
    expect(sc.grade).toBe("A");
  });

  it("scores the bloated sample low (value <= 50)", () => {
    // Measured from the sample: bytes ~2.21MB, 39 requests, ttfb 376ms,
    // load 6800ms. Bytes ~35, requests ~81, ttfb ~78, load clamps to 0.
    // 0.3*35.47 + 0.2*81.33 + 0.2*78 + 0.3*0 = ~42.5 => 43 (grade D).
    const sc = score(slow());
    expect(sc.value).toBe(43);
    expect(sc.grade).toBe("D");
    expect(sc.value).toBeLessThanOrEqual(50);
  });

  it("pins grade boundaries with crafted inputs", () => {
    // Stub just the summary fields the scorer reads.
    const mk = (s: Partial<import("../lib/har/analyze").Summary>) =>
      ({ summary: { totalTransferBytes: 0, totalRequests: 0, ttfbMs: 0, pageLoadMs: 0, thirdPartyBytes: 0, ...s } } as any);

    // All metrics 'good' or better => every sub-score 100 => value 100 => A.
    expect(score(mk({})).grade).toBe("A");

    // All metrics at their 'poor' reference => every sub-score 0 => value 0 => F.
    const worst = score(mk({ totalTransferBytes: 3 * 1024 * 1024, totalRequests: 100, ttfbMs: 1000, pageLoadMs: 5000 }));
    expect(worst.value).toBe(0);
    expect(worst.grade).toBe("F");

    // Bytes/requests/ttfb perfect (100), load at its midpoint (50).
    // blend = 0.3*100 + 0.2*100 + 0.2*100 + 0.3*50 = 30+20+20+15 = 85 => B.
    const b = score(mk({ pageLoadMs: 3000 }));
    expect(b.value).toBe(85);
    expect(b.grade).toBe("B");
  });

  it("score is deterministic on repeated calls", () => {
    const a = slow();
    expect(score(a)).toEqual(score(a));
  });
});

describe("audit — budgets", () => {
  const slow = () => analyze(parseHar(SAMPLES.find((s) => s.id === "slow")!.make()));
  const lean = () => analyze(parseHar(SAMPLES.find((s) => s.id === "lean")!.make()));

  it("the lean sample passes all default budgets", () => {
    const checks = budgets(lean());
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it("the bloated sample fails the byte and load budgets but passes requests", () => {
    const checks = budgets(slow());
    const by = (id: string) => checks.find((c) => c.id === id)!;
    // ~2.21MB > 1.6MB limit, 6800ms > 3000ms limit.
    expect(by("total-bytes").pass).toBe(false);
    expect(by("load-ms").pass).toBe(false);
    // 39 requests <= 50 limit (the sample is under the request budget).
    expect(by("total-requests").pass).toBe(true);
    expect(by("total-requests").actual).toBe(39);
  });

  it("returns one check per metric in a stable order", () => {
    expect(budgets(lean()).map((c) => c.id)).toEqual([
      "total-bytes",
      "total-requests",
      "third-party-bytes",
      "load-ms",
    ]);
  });

  it("honors a custom cfg override that changes a check's limit and pass", () => {
    const a = slow(); // 39 requests
    const def = budgets(a).find((c) => c.id === "total-requests")!;
    expect(def.limit).toBe(50);
    expect(def.pass).toBe(true);

    const tight = budgets(a, { totalRequests: 20 }).find((c) => c.id === "total-requests")!;
    expect(tight.limit).toBe(20);
    expect(tight.pass).toBe(false);
    expect(tight.actual).toBe(39);
  });

  it("budgets are deterministic on repeated calls", () => {
    const a = slow();
    expect(budgets(a)).toEqual(budgets(a));
  });
});

describe("audit — result shape", () => {
  it("audit() exposes recommendations, score, and budgets", () => {
    const a = analyze(parseHar(SAMPLES.find((s) => s.id === "slow")!.make()));
    const r = audit(a);
    expect(Array.isArray(r.recommendations)).toBe(true);
    expect(r.score).toEqual(score(a));
    expect(r.budgets).toEqual(budgets(a));
  });
});
