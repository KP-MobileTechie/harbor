import { describe, it, expect } from "vitest";
import { parseHar, registrableDomain, mimeCategoryOf, normalizeTimings } from "../lib/har/parse";

describe("registrableDomain", () => {
  it("returns eTLD+1, handling multi-part suffixes", () => {
    expect(registrableDomain("www.example.com")).toBe("example.com");
    expect(registrableDomain("a.b.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("localhost")).toBe("localhost");
  });
});

describe("mimeCategoryOf", () => {
  it("maps mime types and url hints to categories", () => {
    expect(mimeCategoryOf("text/html", "/")).toBe("document");
    expect(mimeCategoryOf("application/javascript", "/a.js")).toBe("script");
    expect(mimeCategoryOf("text/css", "/a.css")).toBe("stylesheet");
    expect(mimeCategoryOf("image/png", "/a.png")).toBe("image");
    expect(mimeCategoryOf("font/woff2", "/a.woff2")).toBe("font");
    expect(mimeCategoryOf("application/json", "/api")).toBe("xhr");
    expect(mimeCategoryOf("application/octet-stream", "/x")).toBe("other");
  });
});

describe("normalizeTimings", () => {
  it("clamps -1 to 0 and computes total", () => {
    const t = normalizeTimings({ blocked: -1, dns: 5, connect: 10, ssl: -1, send: 1, wait: 100, receive: 4 });
    expect(t.blocked).toBe(0);
    expect(t.total).toBe(120);
  });
});

const HAR = JSON.stringify({
  log: {
    pages: [{ startedDateTime: "2026-02-01T00:00:00.000Z", pageTimings: { onContentLoad: 200, onLoad: 500 } }],
    entries: [
      {
        startedDateTime: "2026-02-01T00:00:00.000Z",
        request: { method: "GET", url: "https://example.com/", httpVersion: "h2", headers: [], queryString: [], cookies: [] },
        response: { status: 200, statusText: "OK", httpVersion: "h2", content: { mimeType: "text/html", size: 1000 }, headers: [], cookies: [], _transferSize: 1200 },
        timings: { blocked: 1, dns: 2, connect: 3, ssl: 0, send: 1, wait: 50, receive: 5 },
        cache: {},
      },
      {
        startedDateTime: "2026-02-01T00:00:00.300Z",
        request: { method: "GET", url: "https://cdn.other.com/a.js?x=1", httpVersion: "h2", headers: [], queryString: [{ name: "x", value: "1" }], cookies: [] },
        response: { status: 404, statusText: "Not Found", httpVersion: "h2", content: { mimeType: "application/javascript", size: 50 }, headers: [], cookies: [] },
        timings: { blocked: 0, dns: 1, connect: 1, ssl: 0, send: 0, wait: 10, receive: 1 },
        cache: {},
      },
    ],
  },
});

describe("parseHar", () => {
  it("normalizes entries, derives primary domain, third-party flag, errors and page timings", () => {
    const r = parseHar(HAR);
    expect(r.total).toBe(2);
    expect(r.primaryDomain).toBe("example.com");
    expect(r.errors).toBe(1);
    expect(r.onLoadMs).toBe(500);
    expect(r.entries[0].mimeCategory).toBe("document");
    expect(r.entries[0].isThirdParty).toBe(false);
    expect(r.entries[0].startedMs).toBe(0);
    expect(r.entries[1].isThirdParty).toBe(true);
    expect(r.entries[1].startedMs).toBe(300);
    expect(r.entries[1].sizes.transferBytes).toBe(50); // falls back to body size
  });

  it("throws a friendly error on non-HAR JSON", () => {
    expect(() => parseHar('{"foo":1}')).toThrow(/not a valid HAR/i);
    expect(() => parseHar("not json")).toThrow();
  });
});
