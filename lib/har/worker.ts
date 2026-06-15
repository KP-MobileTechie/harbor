/// <reference lib="webworker" />
// ---------------------------------------------------------------------------
// worker.ts — parse + analyze a HAR file off the main thread, so dropping a
// large capture never freezes the UI. Posts back the parse result and the full
// analysis, or an error message. The page falls back to synchronous parsing
// (runParse.ts) when the worker is unavailable.
// ---------------------------------------------------------------------------

import { parseHar } from "./parse";
import { analyze } from "./analyze";

self.onmessage = (e: MessageEvent<string>) => {
  const post = (self as unknown as DedicatedWorkerGlobalScope).postMessage.bind(self);
  try {
    const parse = parseHar(e.data);
    const analysis = analyze(parse);
    post({ ok: true, parse, analysis });
  } catch (err) {
    post({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
