import { describe, it, expect } from "vitest";
import { analysisContext, groundedSystem, pickProvider, extractTextDeltas, extractGeminiTextDeltas } from "../lib/ai/copilot";
import { analyze } from "../lib/har/analyze";
import { parseHar } from "../lib/har/parse";

const HAR = JSON.stringify({
  log: {
    pages: [{ pageTimings: { onLoad: 1500 } }],
    entries: [
      {
        startedDateTime: "2026-02-01T00:00:00.000Z",
        request: { method: "GET", url: "https://example.com/", headers: [], queryString: [], cookies: [] },
        response: { status: 200, content: { mimeType: "text/html", size: 2000 }, headers: [], cookies: [], _transferSize: 2000 },
        timings: { wait: 400, receive: 50 },
        cache: {},
      },
      {
        startedDateTime: "2026-02-01T00:00:00.100Z",
        request: { method: "GET", url: "https://www.google-analytics.com/collect?email=jane@acme.com", headers: [{ name: "Cookie", value: "_ga=1" }], queryString: [{ name: "email", value: "jane@acme.com" }], cookies: [] },
        response: { status: 200, content: { mimeType: "image/gif", size: 50 }, headers: [], cookies: [], _transferSize: 50 },
        timings: { wait: 900, receive: 10 },
        cache: {},
      },
      {
        startedDateTime: "2026-02-01T00:00:00.200Z",
        request: { method: "GET", url: "https://cdn.example.org/app.js", headers: [{ name: "Authorization", value: "Bearer eyJhbGciOiJ.payload.signature" }], queryString: [], cookies: [] },
        response: { status: 200, content: { mimeType: "application/javascript", size: 30000 }, headers: [], cookies: [], _transferSize: 30000 },
        timings: { wait: 200, receive: 20 },
        cache: {},
      },
    ],
  },
});

describe("analysisContext", () => {
  it("serializes the score-free facts: requests, KB, load time, third parties, privacy, slowest", () => {
    const a = analyze(parseHar(HAR));
    const ctx = analysisContext(a);
    expect(ctx).toContain("REQUESTS: 3");
    expect(ctx).toContain("KB"); // total transfer in KB
    expect(ctx).toContain("LOAD: 1500ms");
    expect(ctx).toMatch(/WEIGHT BY CATEGORY/);
    expect(ctx).toMatch(/TOP THIRD PARTIES/);
    expect(ctx).toContain("google-analytics.com");
    expect(ctx).toMatch(/PRIVACY FINDINGS/);
    expect(ctx).toMatch(/SLOWEST REQUESTS/);
    expect(ctx).toContain("google-analytics.com/collect"); // slowest is the 900ms tracker
    // score-free: never mentions a score in Phase 1
    expect(ctx.toLowerCase()).not.toContain("score");
  });

  it("groundedSystem embeds the anti-hallucination rules and the facts", () => {
    const sys = groundedSystem(analyze(parseHar(HAR)));
    expect(sys).toContain("Answer ONLY from the FACTS");
    expect(sys).toContain("FACTS:");
    expect(sys).toContain("REQUESTS: 3");
  });
});

describe("pickProvider", () => {
  it("routes Anthropic keys to anthropic and everything else to gemini", () => {
    expect(pickProvider("sk-ant-abc123")).toBe("anthropic");
    expect(pickProvider("  sk-ant-xyz  ")).toBe("anthropic");
    expect(pickProvider("AIzaSyXXXX")).toBe("gemini");
    expect(pickProvider("")).toBe("gemini");
  });
});

describe("extractTextDeltas (Anthropic SSE)", () => {
  it("pulls text from content_block_delta events and ignores keepalives/other types", () => {
    const sse = [
      'data: {"type":"message_start"}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
      "data: ",
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
      'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{}"}}',
    ].join("\n");
    expect(extractTextDeltas(sse)).toEqual(["Hello", " world"]);
  });

  it("tolerates partial / invalid JSON lines", () => {
    expect(extractTextDeltas('data: {"type":"content_block_del')).toEqual([]);
  });
});

describe("extractGeminiTextDeltas (Gemini SSE)", () => {
  it("pulls text from candidate parts", () => {
    const sse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Root"}]}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":" cause"}]}}]}',
    ].join("\n");
    expect(extractGeminiTextDeltas(sse)).toEqual(["Root", " cause"]);
  });

  it("returns nothing for empty candidates", () => {
    expect(extractGeminiTextDeltas('data: {"candidates":[]}')).toEqual([]);
  });
});
