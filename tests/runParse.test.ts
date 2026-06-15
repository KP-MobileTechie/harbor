import { describe, it, expect } from "vitest";
import { runParse } from "../lib/har/runParse";
import { SAMPLES } from "../lib/har/sample";

// In the node test environment Worker is undefined, so runParse takes the
// synchronous path. We assert it resolves with a valid, meaningful analysis.
describe("runParse", () => {
  it("resolves with an analysis via the synchronous fallback", async () => {
    expect(typeof Worker).toBe("undefined");
    const out = await runParse(SAMPLES[0].make());
    expect(out.parse.total).toBeGreaterThan(0);
    expect(out.analysis.summary.totalRequests).toBe(out.parse.total);
    expect(out.analysis.summary.totalRequests).toBeGreaterThan(0);
    expect(out.analysis.summary.totalTransferBytes).toBeGreaterThan(0);
  });

  it("parses the lean sample too", async () => {
    const out = await runParse(SAMPLES[1].make());
    expect(out.analysis.summary.totalRequests).toBeGreaterThan(0);
    expect(out.analysis.summary.cacheHitRatio).toBeGreaterThan(0);
  });
});
