import { describe, it, expect } from "vitest";
import { analyzeThirdParties, classifyDomain } from "../lib/har/thirdparty";
import { parseHar } from "../lib/har/parse";

describe("classifyDomain", () => {
  it("classifies known third parties", () => {
    expect(classifyDomain("google-analytics.com")).toBe("analytics");
    expect(classifyDomain("doubleclick.net")).toBe("ads");
    expect(classifyDomain("fonts.gstatic.com")).toBe("fonts");
    expect(classifyDomain("random.example")).toBe("unknown");
  });
});

const HAR = JSON.stringify({
  log: {
    entries: [
      {
        startedDateTime: "2026-02-01T00:00:00.000Z",
        request: { method: "GET", url: "https://example.com/", headers: [], queryString: [], cookies: [] },
        response: { status: 200, content: { mimeType: "text/html", size: 100 }, headers: [], cookies: [] },
        timings: { wait: 10, receive: 1 },
        cache: {},
      },
      {
        startedDateTime: "2026-02-01T00:00:00.010Z",
        request: { method: "GET", url: "https://google-analytics.com/collect?v=1", headers: [], queryString: [{ name: "v", value: "1" }], cookies: [] },
        response: { status: 200, content: { mimeType: "image/gif", size: 50 }, headers: [], cookies: [] },
        timings: { wait: 5, receive: 1 },
        cache: {},
      },
    ],
  },
});

describe("analyzeThirdParties", () => {
  it("groups third parties with bytes, time and category", () => {
    const tp = analyzeThirdParties(parseHar(HAR));
    expect(tp).toHaveLength(1);
    expect(tp[0].domain).toBe("google-analytics.com");
    expect(tp[0].category).toBe("analytics");
    expect(tp[0].requests).toBe(1);
    expect(tp[0].sentQueryParams).toBe(true);
  });
});
