# Harbor: design spec

**Date:** 2026-06-15
**Status:** Approved, ready for implementation planning

## One line

Drop a browser `.har` capture and see your page's network story: a request
waterfall, weight breakdown, third-party map, privacy/secret leaks, a scored
performance audit with ranked fixes, and a before/after diff, then ask a
grounded AI what's wrong. 100% in your browser, nothing uploaded.

## Why this project

HAR files contain real auth tokens, cookies, and PII, so "100% local, nothing
uploaded" is not a nicety here: it is the only safe way to analyze one. That
makes Harbor a sharp fit for the portfolio's privacy-first identity, on top of
a frequent, universal developer pain (debugging slow pages and third-party
bloat) with an instantly recognizable hero visualization (the waterfall).

Shares the portfolio DNA of RepoReel and Logloom: a $0, fully client-side app
with a deterministic, unit-tested engine + a grounded BYO-key AI copilot + a
striking visualization, in a "drop a file, get instant insight" shape. Harbor
goes a step further toward production grade: a deterministic audit engine means
it delivers ranked, actionable fixes and a performance score with no AI key at
all; the copilot is layered on top of that, not a dependency.

## Stack

Same as Logloom: Next.js 16 static export (`output: "export"`), React 19,
Tailwind v4 (`@tailwindcss/postcss`, `@import "tailwindcss"`), TypeScript,
Vitest. No backend, no analytics, no signup, $0 to run.

## Architecture: one engine, pure modules

A single parse of the HAR feeds every view. The engine lives in `lib/har/` as
small, independent, pure functions; the UI is a thin renderer. Every module is
deterministic and unit-tested.

### Core model and parse

**`lib/har/types.ts`** — the normalized internal model so the analysis layer
never touches raw HAR shape directly:

- `HarRequest`: `{ index, startedMs, url, scheme, host, registrableDomain,
  path, method, status, statusText, httpVersion, mimeCategory, isThirdParty,
  fromCache, timings, sizes, reqHeaders, resHeaders, reqCookies, setCookies,
  queryParams, initiatorType?, redirectUrl? }`
- `Timings`: `{ blocked, dns, connect, ssl, send, wait, receive }` (ms; -1
  normalized to 0), plus `total`.
- `Sizes`: `{ headersBytes, bodyBytes, transferBytes }` (transfer falls back to
  body when `_transferSize` is absent).
- `MimeCategory`: `"document" | "script" | "stylesheet" | "image" | "font" |
  "xhr" | "media" | "other"`.
- `ParseResult`: `{ pageUrl, primaryDomain, startedMs, onContentLoadMs?,
  onLoadMs?, entries, total, errors }`. Page timings come from the HAR `pages`
  array when present.

**`lib/har/parse.ts`** — `parseHar(text): ParseResult`. Parses JSON, validates
it is a HAR (`log.entries` array), normalizes every entry, derives
`primaryDomain`, sets `isThirdParty` by registrable domain, categorizes mime
types, and converts `startedDateTime` to an epoch offset. Throws a friendly
`Error` on non-HAR / invalid JSON; tolerates missing optional fields. Exported
helpers: `registrableDomain(host)` (eTLD+1 with handling for common multi-part
suffixes like `co.uk`, `com.au`), `mimeCategoryOf(mimeType, url)`,
`normalizeTimings(raw)`, `headerMap(headers)`.

### Analysis modules

**`lib/har/waterfall.ts`** — `buildWaterfall(parse)`: per-request offset +
ordered phase segments, `pageLoadMs`, `slowest`, `criticalPathMs` (longest-pole
heuristic, documented as an estimate since HAR lacks dependency edges),
`renderBlocking` (head CSS/JS finishing before the document `receive`
completes; labeled a heuristic).

**`lib/har/weight.ts`** — `analyzeWeight(parse)`: transfer bytes + counts by
`mimeCategory` and by `registrableDomain`, first-vs-third split, estimated
compression savings for text resources lacking gzip/br, `biggestOffenders`.

**`lib/har/thirdparty.ts`** — `analyzeThirdParties(parse)`: groups third-party
requests by registrable domain with count/bytes/time and a `category` from a
built-in list (analytics, ads, tag manager, CDN, social, fonts, unknown), plus
whether cookies/query params were sent.

**`lib/har/privacy.ts`** — `scanPrivacy(parse)`: local-only regex scan for
secrets (bearer tokens, JWTs, common API-key patterns, `Authorization` /
`Set-Cookie` values), PII (emails), trackers, **third-party cookie-sync**
(same identifier sent to multiple third parties), and **fingerprinting-script**
heuristics (requests to known fingerprinting libs / canvas-fp domains). Each
finding: `{ severity, kind, where, evidence }` with evidence masked so the UI
never re-displays a full secret.

**`lib/har/security.ts`** — `auditSecurity(parse)`: document security-header
audit (missing HSTS, CSP, X-Content-Type-Options, X-Frame-Options),
mixed-content detection (http subresources on an https document), and insecure
cookie flags (missing `Secure` / `HttpOnly` / `SameSite`). Returns severity-
ranked findings.

**`lib/har/caching.ts`** — `analyzeCaching(parse)`: cache-hit ratio,
`Cache-Control` / `Expires` audit (cacheable resources served without caching
headers), and a **repeat-view simulation** estimating bytes/requests that would
load from cache on a second visit.

**`lib/har/protocol.ts`** — `analyzeProtocol(parse)`: HTTP version breakdown
(h1/h2/h3), **redirect-chain** detection (3xx hops and time wasted), and a
per-host connection-reuse summary.

**`lib/har/audit.ts`** — the production centerpiece. `audit(analysis):
AuditResult` produces:

- `recommendations`: a deterministic, severity- and impact-ranked list, each
  `{ id, title, detail, impact (bytes or ms saved), severity, count }`. Rules
  draw on every module: uncompressed text, oversized/legacy-format images,
  render-blocking resources, long redirect chains, missing cache headers,
  excessive third parties, h1-only hosts, insecure cookies, etc.
- `score`: a 0-100 performance score (Lighthouse-style weighted blend of total
  bytes, request count, TTFB, load time) with a letter grade.
- `budgets`: pass/fail against configurable budgets (total bytes, request
  count, third-party bytes, load time) with sensible defaults.

**`lib/har/diff.ts`** — `diff(a: Analysis, b: Analysis): HarDiff`: compares two
captures: requests added/removed, per-metric deltas (bytes, requests, load
time, score), which requests got faster/slower, and budget/score movement.

**`lib/har/analyze.ts`** — `analyze(parse): Analysis` orchestrates the modules
into one object: `{ summary, waterfall, weight, thirdParties, privacy,
security, caching, protocol, audit }` where `summary` =
`{ totalRequests, totalTransferBytes, pageLoadMs, ttfbMs, errors,
cacheHitRatio, firstPartyBytes, thirdPartyBytes }`.

**`lib/har/summary.ts`** — `toMarkdown(name, parse, analysis)`: shareable
report (score + grade, budgets, top recommendations, slowest requests, weight,
third parties, privacy + security findings). Pure and deterministic.

### Infrastructure

**`lib/har/runParse.ts` + `lib/har/worker.ts`** — `runParse(text)` runs parse +
analyze in a Web Worker (HAR files get large) with a synchronous fallback when
Workers are unavailable or error. Same pattern Logloom ships.

**`lib/ai/copilot.ts`** — port the proven Logloom/RepoReel grounded copilot:
serialize `Analysis` (including the audit recommendations) into a compact FACTS
block, answer-only-from-facts system prompt, BYO Anthropic or Gemini key held
in memory only, provider auto-detected by key prefix, SSE streaming, multi-turn
`ChatMessage[]`. Pure helpers (`analysisContext`, `pickProvider`, the two SSE
delta parsers) are unit-tested.

## UI

`components/` + `app/page.tsx` (single capture) + `app/compare/page.tsx`
(diff). Client components.

- **Empty state:** dropzone + paste + "Try a sample" from a library of baked
  HARs (`lib/har/sample.ts`: a slow/ad-heavy page and a well-optimized page).
- **Dashboard (single capture), top to bottom:**
  1. **Score + budgets header:** the 0-100 score gauge with grade, budget
     pass/fail chips, and headline stats (requests, bytes, load time, TTFB,
     cache ratio, first/third split).
  2. **Recommendations:** ranked, actionable fix list with estimated savings.
  3. **Waterfall (hero), interactive:** phase-colored bars on a shared time
     axis; filter by type/domain/status, search, sort; click a row to open a
     **request drill-down panel** (redacted headers, timing breakdown, cookies,
     sizes). Selected request + active filters live in the URL hash so views
     are linkable.
  4. **Weight breakdown:** stacked bars by type + per-domain list + biggest
     offenders.
  5. **Third parties:** ranked list with bytes/time/category/data-sent.
  6. **Security & privacy:** merged severity-ranked findings (headers, mixed
     content, cookie flags, secrets, PII, trackers, cookie-sync,
     fingerprinting) with masked evidence.
  7. **Caching & protocol:** repeat-view savings, cache-header audit, HTTP
     version split, redirect chains, connection reuse.
  8. **Copilot:** grounded BYO-key streaming chat (`components/Copilot.tsx`).
- **Compare view (`/compare`):** drop two HARs and render the diff: metric
  deltas, score/budget movement, requests added/removed, faster/slower lists.
- **Export:** "Download summary" (Markdown), "Export data" (JSON), and "Save
  waterfall" (PNG via canvas).
- **Polish:** responsive, keyboard-navigable, accessible (labeled controls,
  focus states), dark theme consistent with the portfolio.

## Data flow

file/drop/paste -> text -> `runParse` (worker) -> `parse` -> `analyze`
(including `audit`) -> `Analysis` -> UI renders all sections + `Copilot`
grounds on it. Compare mode runs two `runParse` calls then `diff`. The only
data that ever leaves the browser is an optional AI request to the user's own
provider with the user's own key.

## Error handling

- Invalid JSON / non-HAR: caught in `parseHar`, friendly inline error, no
  crash.
- Empty capture: dashboard renders with empty-section messaging.
- Worker unavailable or throws: `runParse` falls back to synchronous parsing.
- Large captures: worker keeps the UI responsive; a "Parsing..." state shows.
- Missing optional HAR fields: normalized to safe defaults during parse.
- Compare with mismatched/empty captures: per-side validation, clear messaging.

## Delivery phases

The build ships incrementally; each phase is independently shippable and keeps
tests + the static build green.

- **Phase 1: MVP core.** types, parse, waterfall, weight, thirdparty, privacy
  (secrets/PII/trackers), analyze, summary, worker/runParse, copilot, basic
  dashboard with a static waterfall + a downloadable Markdown report. This is
  the first day's target.
- **Phase 2: Audit & score.** `audit.ts` (recommendations + score + budgets),
  score/budget header, recommendations UI, audit facts fed into the copilot.
- **Phase 3: Interactive waterfall.** filter/search/sort, request drill-down
  panel, URL-hash view state.
- **Phase 4: Deep security/privacy + caching + protocol.** `security.ts`,
  `caching.ts`, `protocol.ts`, extended `privacy.ts` (cookie-sync,
  fingerprinting), the security/privacy and caching/protocol sections.
- **Phase 5: Compare mode.** `diff.ts` + `/compare` view.
- **Phase 6: Polish & ship.** sample library, JSON + PNG export, a11y +
  responsive pass, README, deploy to Vercel.

## Testing

Vitest unit tests on every pure module: parse/normalize (+ helpers), waterfall
geometry, weight aggregation, thirdparty classification, privacy patterns +
masking, security audit, caching + repeat-view math, protocol/redirect
detection, audit recommendations + score + budgets, diff deltas, summary
rendering, and copilot (`analysisContext`, `pickProvider`, both SSE parsers).
Target 60+ tests across phases, all green. `npm run typecheck`, `npm test`, and
`npm run build` (static export) must pass before each phase ships.

## Out of scope (YAGNI)

- No HAR recording/capture (users export from their own browser devtools).
- No multi-capture history beyond the two-way compare.
- No server, accounts, persistence, or analytics.
- Render-blocking and critical-path remain documented heuristics, not a real
  dependency graph (HAR does not provide one).

## Conventions

Portfolio conventions apply: commits authored as `krunal85
<kp587372@gmail.com>` with no AI attribution; public repo under
`KP-MobileTechie`; deploy to Vercel; no em dashes in content.
