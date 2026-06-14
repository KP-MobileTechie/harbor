import { describe, it, expect } from "vitest";
import { buildWaterfall } from "../lib/har/waterfall";
import { parseHar } from "../lib/har/parse";

const HAR = JSON.stringify({
  log: {
    entries: [
      {
        startedDateTime: "2026-02-01T00:00:00.000Z",
        request: { method: "GET", url: "https://example.com/", headers: [], queryString: [], cookies: [] },
        response: { status: 200, content: { mimeType: "text/html", size: 1000 }, headers: [], cookies: [] },
        timings: { blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: 100, receive: 10 },
        cache: {},
      },
      {
        startedDateTime: "2026-02-01T00:00:00.050Z",
        request: { method: "GET", url: "https://example.com/a.css", headers: [], queryString: [], cookies: [] },
        response: { status: 200, content: { mimeType: "text/css", size: 500 }, headers: [], cookies: [] },
        timings: { blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: 300, receive: 10 },
        cache: {},
      },
    ],
  },
});

describe("buildWaterfall", () => {
  it("computes rows with offsets, slowest ordering and page load time", () => {
    const w = buildWaterfall(parseHar(HAR));
    expect(w.rows).toHaveLength(2);
    expect(w.rows[1].offsetMs).toBe(50);
    expect(w.slowest[0].timings.total).toBe(310); // the css is slowest
    expect(w.pageLoadMs).toBeGreaterThanOrEqual(360); // 50 + 310
  });
});
