// ---------------------------------------------------------------------------
// runParse.ts — run parse + analyze off the main thread via a Web Worker so a
// large HAR never freezes the UI. Falls back to synchronous parsing when
// Workers are unavailable (node/tests, the static export at build time, or if
// the worker fails to spawn). Returns the parse result plus the full analysis.
// ---------------------------------------------------------------------------

import { parseHar } from "./parse";
import { analyze, type Analysis } from "./analyze";
import type { ParseResult } from "./types";

export interface ParseOutcome {
  parse: ParseResult;
  analysis: Analysis;
}

function runSync(text: string): ParseOutcome {
  const parse = parseHar(text);
  return { parse, analysis: analyze(parse) };
}

/** Parse + analyze, preferring a Web Worker and falling back to the main thread. */
export function runParse(text: string): Promise<ParseOutcome> {
  if (typeof Worker === "undefined") return Promise.resolve(runSync(text));
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    } catch {
      resolve(runSync(text));
      return;
    }
    const done = (out: ParseOutcome) => {
      worker.terminate();
      resolve(out);
    };
    worker.onmessage = (e: MessageEvent<{ ok: boolean; parse?: ParseResult; analysis?: Analysis }>) => {
      if (e.data.ok && e.data.parse && e.data.analysis) done({ parse: e.data.parse, analysis: e.data.analysis });
      else done(runSync(text)); // worker errored on this input — retry synchronously
    };
    worker.onerror = () => done(runSync(text));
    worker.postMessage(text);
  });
}
