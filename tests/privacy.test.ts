import { describe, it, expect } from "vitest";
import { scanPrivacy, maskSecret } from "../lib/har/privacy";
import { parseHar } from "../lib/har/parse";

describe("maskSecret", () => {
  it("masks all but the last 4 chars", () => {
    expect(maskSecret("abcdefgh.ijkl")).toBe("…ijkl");
  });
});

const HAR = JSON.stringify({
  log: {
    entries: [
      {
        startedDateTime: "2026-02-01T00:00:00.000Z",
        request: {
          method: "GET",
          url: "https://example.com/?email=jane@acme.com",
          headers: [{ name: "Authorization", value: "Bearer eyJhbGciOiJ.payload.sig" }],
          queryString: [{ name: "email", value: "jane@acme.com" }],
          cookies: [],
        },
        response: { status: 200, content: { mimeType: "text/html", size: 10 }, headers: [], cookies: [] },
        timings: { wait: 1, receive: 1 },
        cache: {},
      },
      {
        startedDateTime: "2026-02-01T00:00:00.010Z",
        request: { method: "GET", url: "https://doubleclick.net/p?id=1", headers: [], queryString: [], cookies: [] },
        response: { status: 200, content: { mimeType: "image/gif", size: 1 }, headers: [], cookies: [] },
        timings: { wait: 1, receive: 1 },
        cache: {},
      },
    ],
  },
});

describe("scanPrivacy", () => {
  it("flags bearer tokens, emails (PII) and tracker requests, with masked evidence", () => {
    const f = scanPrivacy(parseHar(HAR));
    const kinds = f.map((x) => x.kind);
    expect(kinds).toContain("secret");
    expect(kinds).toContain("pii");
    expect(kinds).toContain("tracker");
    const secret = f.find((x) => x.kind === "secret")!;
    expect(secret.evidence).not.toContain("eyJhbGciOiJ"); // masked
    expect(secret.severity).toBe("high");
  });
});
