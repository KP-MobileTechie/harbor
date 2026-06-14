import { describe, it, expect } from "vitest";
import { analyze } from "../lib/har/analyze";
import { parseHar } from "../lib/har/parse";

const HAR = JSON.stringify({
  log: {
    entries: [
      {
        startedDateTime: "2026-02-01T00:00:00.000Z",
        request: { method: "GET", url: "https://example.com/", headers: [], queryString: [], cookies: [] },
        response: { status: 200, content: { mimeType: "text/html", size: 1000 }, headers: [], cookies: [], _transferSize: 1000 },
        timings: { wait: 50, receive: 5 },
        cache: {},
      },
      {
        startedDateTime: "2026-02-01T00:00:00.060Z",
        request: { method: "GET", url: "https://cdn.other.com/a.js", headers: [], queryString: [], cookies: [] },
        response: { status: 500, content: { mimeType: "application/javascript", size: 2000 }, headers: [], cookies: [], _transferSize: 2000 },
        timings: { wait: 20, receive: 2 },
        cache: {},
      },
    ],
  },
});

describe("analyze", () => {
  it("produces a summary plus every section", () => {
    const a = analyze(parseHar(HAR));
    expect(a.summary.totalRequests).toBe(2);
    expect(a.summary.totalTransferBytes).toBe(3000);
    expect(a.summary.errors).toBe(1);
    expect(a.summary.firstPartyBytes).toBe(1000);
    expect(a.waterfall.rows).toHaveLength(2);
    expect(a.weight.totalBytes).toBe(3000);
    expect(Array.isArray(a.thirdParties)).toBe(true);
    expect(Array.isArray(a.privacy)).toBe(true);
  });
});
