# Harbor

> Drop a .har file. See what's slow. Nothing uploaded.

Harbor turns a browser's exported `.har` network capture into an instant, explorable picture of what your page actually did on the wire: a summary of the key metrics, a request waterfall segmented by timing phase, a weight breakdown, a third-party map, and privacy findings (leaked secrets, PII, trackers), all parsed **100% in your browser**. HAR files are full of real auth tokens, cookies, and PII, so "nothing uploaded" is not a nicety here: it is the only safe way to analyze one. A grounded AI copilot (bring your own key) then answers "what's making this slow?" using only the computed facts.

Same DNA as its siblings [RepoReel](../reporeel) and [Logloom](../logloom): a deterministic, tested, client-side engine + a beautiful visualization + a grounded AI layer, $0 to run, privacy-first.

Live demo: coming soon.

---

## Privacy stance

This is the whole point, so it is worth being explicit:

- **100% client-side.** Parsing, analysis, and rendering all happen in your browser. There is no backend, no server, no database.
- **Nothing is ever uploaded.** Your HAR never leaves the browser. No analytics, no telemetry, no tracking of any kind.
- **The AI copilot is bring-your-own-key.** Your Anthropic or Gemini API key is stored only in your browser (localStorage) and is sent only to the AI provider you choose, never to Harbor. The only data that ever leaves the browser is an optional request to your own provider, with your own key, when you choose to ask the copilot a question.

## What it shows

A single parse of the HAR feeds every view:

- **Summary header** with the headline metrics: total requests, bytes transferred, load time, TTFB, errors, cache-hit ratio, and the first-party vs third-party split.
- **Waterfall** of every request on a shared time axis, each bar segmented by timing phase (blocked, DNS, connect, SSL, send, wait, receive).
- **Weight breakdown**: bytes by category (script, image, stylesheet, font, document, and more) and by domain, the biggest offenders, and estimated compression savings for text resources served without gzip/brotli.
- **Third-party analysis**: requests grouped by registrable domain and classified (analytics, ads, tag manager, CDN, social, fonts), with bytes, time, and whether cookies or query params were sent.
- **Privacy findings**: a local-only regex scan for leaked secrets (bearer tokens, JWTs, API keys), PII (emails), and tracker requests, with evidence **masked** so the UI never re-displays a full secret.
- **AI copilot**: a grounded, BYO-key chat (Anthropic or Gemini) that answers only from the computed facts.
- **Markdown report**: a downloadable summary of everything above.

## How to use

### In the app

1. Drop a `.har` file onto the dropzone, paste HAR JSON, or try a built-in sample.
2. Read the dashboard: summary, waterfall, weight, third parties, and privacy findings.
3. Optionally add an Anthropic or Gemini API key to ask the copilot grounded questions about the capture.

To get a `.har` file: open your browser's DevTools, go to the Network tab, reload the page, then right-click the request list and choose "Save all as HAR".

### Locally

```bash
npm install
npm run dev      # run locally at http://localhost:3000
npm test         # run the test suite (29 tests across 9 files)
npm run build    # produce the static export in out/
```

## Tech stack

- **Next.js 16** with static export (`output: "export"`)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **Vitest** for the unit tests

No backend, no analytics, no signup, $0 to run.

## Architecture

A deterministic core with a thin UI on top. The engine lives in `lib/har/` as small, independent, pure functions; the UI is just a renderer over them.

- `lib/har/types.ts`: the normalized internal model, so the analysis layer never touches raw HAR shape directly.
- `lib/har/parse.ts`: `parseHar(text)` validates the HAR, normalizes every entry, derives the primary domain, sets first-vs-third-party by registrable domain, categorizes mime types, and throws a friendly error on invalid input.
- `lib/har/waterfall.ts`, `weight.ts`, `thirdparty.ts`, `privacy.ts`: the analysis modules.
- `lib/har/analyze.ts`: orchestrates the modules into one `Analysis` object.
- `lib/har/summary.ts`: `toMarkdown(...)`, the shareable report.
- `lib/har/runParse.ts` + `lib/har/worker.ts`: runs parse and analyze in a Web Worker (HAR files get large) with a synchronous fallback when Workers are unavailable.
- `lib/ai/copilot.ts`: serializes the `Analysis` into a compact FACTS block, an answer-only-from-facts system prompt, BYO Anthropic or Gemini key held in the browser, provider auto-detected by key prefix, with streaming.

Every pure module is unit-tested with Vitest: **29 tests across 9 files**, all green, with `npm run typecheck` and `npm run build` (static export) clean.

## Status: Phase 1 of 6

Harbor ships incrementally. Each phase is independently shippable and keeps the tests and the static build green.

- **Phase 1 (done): MVP core.** Parse, waterfall, weight, third parties, privacy, grounded copilot, dashboard, and Markdown export.
- **Phase 2:** deterministic audit, performance score, and budgets.
- **Phase 3:** interactive waterfall (filter, search, sort, request drill-down, linkable state).
- **Phase 4:** deep security (headers, cookies, mixed content), caching, and protocol analysis.
- **Phase 5:** before/after compare mode.
- **Phase 6:** polish, JSON and PNG export, accessibility, responsive, and deploy.

## Conventions

- Commits and pushes via the owner's `gh` CLI under the `krunal85` identity only, never co-authored.
- No em dashes in docs or content (use colons, commas, or parentheses).
