import { describe, it, expect } from "vitest";
import { analyzeWeight } from "../lib/har/weight";
import { parseHar } from "../lib/har/parse";

const HAR = JSON.stringify({
  log: {
    entries: [
      {
        startedDateTime: "2026-02-01T00:00:00.000Z",
        request: { method: "GET", url: "https://example.com/", headers: [], queryString: [], cookies: [] },
        response: { status: 200, content: { mimeType: "text/html", size: 1000 }, headers: [], cookies: [], _transferSize: 1000 },
        timings: { wait: 10, receive: 1 },
        cache: {},
      },
      {
        startedDateTime: "2026-02-01T00:00:00.010Z",
        request: { method: "GET", url: "https://cdn.other.com/a.js", headers: [], queryString: [], cookies: [] },
        response: { status: 200, content: { mimeType: "application/javascript", size: 2000 }, headers: [], cookies: [], _transferSize: 2000 },
        timings: { wait: 10, receive: 1 },
        cache: {},
      },
    ],
  },
});

describe("analyzeWeight", () => {
  it("aggregates bytes by category and domain with first/third split", () => {
    const w = analyzeWeight(parseHar(HAR));
    expect(w.totalBytes).toBe(3000);
    expect(w.firstPartyBytes).toBe(1000);
    expect(w.thirdPartyBytes).toBe(2000);
    expect(w.byCategory.find((c) => c.category === "script")!.bytes).toBe(2000);
    expect(w.byDomain[0].bytes).toBe(2000); // largest first
    expect(w.biggestOffenders[0].sizes.transferBytes).toBe(2000);
  });
});
