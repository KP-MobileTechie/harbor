// ---------------------------------------------------------------------------
// ai/copilot.ts — Harbor's grounded web-performance copilot. The deterministic
// Analysis (summary, weight by category, third parties, privacy findings,
// slowest requests) is serialized into the prompt as ground truth and the model
// is told to answer ONLY from it and cite specific requests, domains, and
// millisecond/byte figures, so it reasons about the actual capture, not
// hallucinated requests. BYO API key, held in memory only: nothing is sent
// anywhere unless the user opts in with their own Anthropic or Gemini key.
//
// Pure helpers (`analysisContext`, `pickProvider`, the SSE parsers) are
// unit-tested; the streaming fetch wrappers are browser-only plumbing.
// ---------------------------------------------------------------------------

import type { Analysis } from "@/lib/har/analyze";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

/** Serialize the analysis into a compact, factual context block for grounding.
 *  Phase 2: includes the deterministic audit (0-100 score, budget pass/fail,
 *  and the top recommendations) alongside the raw capture facts. */
export function analysisContext(a: Analysis): string {
  const L: string[] = [];
  const s = a.summary;
  L.push(
    `REQUESTS: ${s.totalRequests}; TOTAL ${kb(s.totalTransferBytes)} (first-party ${kb(s.firstPartyBytes)}, third-party ${kb(s.thirdPartyBytes)}); ${s.errors} errors; cache hit ratio ${(s.cacheHitRatio * 100).toFixed(0)}%.`,
  );
  L.push(`LOAD: ${Math.round(a.waterfall.pageLoadMs)}ms; TTFB ${Math.round(s.ttfbMs)}ms; critical path ${Math.round(a.waterfall.criticalPathMs)}ms.`);
  if (a.weight.byCategory.length) {
    L.push("WEIGHT BY CATEGORY:");
    for (const c of a.weight.byCategory.slice(0, 8)) L.push(`- ${c.category}: ${kb(c.bytes)} across ${c.count} requests`);
  }
  if (a.thirdParties.length) {
    L.push("TOP THIRD PARTIES:");
    for (const tp of a.thirdParties.slice(0, 8))
      L.push(`- ${tp.domain} (${tp.category}): ${tp.requests} requests, ${kb(tp.bytes)}, ${Math.round(tp.timeMs)}ms${tp.sentCookies ? ", sent cookies" : ""}`);
  }
  if (a.privacy.length) {
    const bySev = { high: 0, medium: 0, low: 0 } as Record<string, number>;
    for (const f of a.privacy) bySev[f.severity]++;
    L.push(`PRIVACY FINDINGS: ${bySev.high} high, ${bySev.medium} medium, ${bySev.low} low.`);
    for (const f of a.privacy.slice(0, 8)) L.push(`- [${f.severity}] ${f.title} at ${f.where}`);
  }
  if (a.waterfall.slowest.length) {
    L.push("SLOWEST REQUESTS:");
    for (const r of a.waterfall.slowest.slice(0, 8)) L.push(`- ${Math.round(r.timings.total)}ms ${r.method} ${r.host}${r.path} (${r.mimeCategory}, ${kb(r.sizes.transferBytes)})`);
  }
  const audit = a.audit;
  L.push(`SCORE: ${audit.score.value}/100 (grade ${audit.score.grade}), a deterministic 0-100 performance rating.`);
  const passing = audit.budgets.filter((b) => b.pass).length;
  const failing = audit.budgets.filter((b) => !b.pass);
  let budgetLine = `BUDGETS: ${passing} of ${audit.budgets.length} passing.`;
  if (failing.length) budgetLine += ` Failing: ${failing.map((b) => b.label).join(", ")}.`;
  L.push(budgetLine);
  if (audit.recommendations.length) {
    L.push("TOP RECOMMENDATIONS:");
    for (const r of audit.recommendations.slice(0, 5)) L.push(`- [${r.id}] ${r.title}: ${r.detail}`);
  } else {
    L.push("TOP RECOMMENDATIONS: none (no issues detected).");
  }
  return L.join("\n");
}

const SYSTEM = `You are Harbor, an expert web-performance and privacy engineer analyzing a network capture.
You are given FACTS extracted deterministically from the user's capture. Rules:
- Answer ONLY from the FACTS. Do not invent requests, domains, or figures.
- The SCORE is a deterministic 0-100 performance rating you may cite.
- Cite specific requests, domains, and millisecond/byte figures from the FACTS.
- If the FACTS don't answer the question, say so and point to what in the capture to look at.
- Be concise and concrete.`;

/** The constant grounding for a multi-turn conversation. */
export function groundedSystem(a: Analysis): string {
  return `${SYSTEM}\n\nFACTS:\n${analysisContext(a)}`;
}

// ── Provider routing ─────────────────────────────────────────────────────────

export function pickProvider(apiKey: string): "anthropic" | "gemini" {
  return apiKey.trim().startsWith("sk-ant") ? "anthropic" : "gemini";
}

export function extractTextDeltas(eventText: string): string[] {
  const out: string[] = [];
  for (const line of eventText.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const json = t.slice(5).trim();
    if (!json || json === "[DONE]") continue;
    try {
      const evt = JSON.parse(json) as { type?: string; delta?: { type?: string; text?: string } };
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) out.push(evt.delta.text);
    } catch {
      /* keepalive / partial */
    }
  }
  return out;
}

export function extractGeminiTextDeltas(eventText: string): string[] {
  const out: string[] = [];
  for (const line of eventText.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const json = t.slice(5).trim();
    if (!json || json === "[DONE]") continue;
    try {
      const evt = JSON.parse(json) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      for (const p of evt.candidates?.[0]?.content?.parts ?? []) if (p.text) out.push(p.text);
    } catch {
      /* partial */
    }
  }
  return out;
}

async function pump(body: ReadableStream<Uint8Array>, extract: (s: string) => string[], onText: (d: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const nl = buf.lastIndexOf("\n");
    if (nl >= 0) {
      for (const t of extract(buf.slice(0, nl))) onText(t);
      buf = buf.slice(nl + 1);
    }
  }
  for (const t of extract(buf)) onText(t);
}

export async function streamAnthropic(system: string, messages: ChatMessage[], opts: AskOptions, onText: (d: string) => void): Promise<void> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: opts.model || "claude-haiku-4-5-20251001", max_tokens: 1024, stream: true, system, messages }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`Anthropic API error ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  await pump(res.body, extractTextDeltas, onText);
}

export async function streamGemini(system: string, messages: ChatMessage[], opts: AskOptions, onText: (d: string) => void): Promise<void> {
  const model = opts.model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 1024 },
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`Gemini API error ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  await pump(res.body, extractGeminiTextDeltas, onText);
}

export async function streamCopilot(system: string, messages: ChatMessage[], opts: AskOptions, onText: (d: string) => void): Promise<void> {
  return pickProvider(opts.apiKey) === "anthropic" ? streamAnthropic(system, messages, opts, onText) : streamGemini(system, messages, opts, onText);
}
