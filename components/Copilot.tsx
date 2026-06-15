"use client";

// ---------------------------------------------------------------------------
// Copilot.tsx — the grounded performance + privacy chat panel. The user brings
// their own Anthropic (sk-ant-...) or Gemini key, held in memory and optionally
// localStorage only, never persisted anywhere else and never sent anywhere but
// the chosen provider. Every answer is grounded in the deterministic Analysis
// via groundedSystem(analysis), so the model reasons about the real capture
// instead of hallucinating. Streaming, multi-turn, with a stop button.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { groundedSystem, streamCopilot, pickProvider, type ChatMessage } from "@/lib/ai/copilot";
import type { Analysis } from "@/lib/har/analyze";

const SUGGESTIONS = [
  "What's the biggest performance problem?",
  "Which third parties should I drop?",
  "Any secrets leaking?",
  "What should I fix first?",
];

const KEY_STORAGE = "harbor.copilot.key";

export function Copilot({ analysis }: { analysis: Analysis }) {
  const [apiKey, setApiKey] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore a previously entered key from localStorage (browser only).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORAGE);
      if (saved) setApiKey(saved);
    } catch {
      /* storage blocked */
    }
  }, []);

  const onKeyChange = useCallback((value: string) => {
    setApiKey(value);
    try {
      if (value.trim()) localStorage.setItem(KEY_STORAGE, value);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      /* storage blocked */
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || !apiKey.trim() || streaming) return;
      setError(null);
      setInput("");
      const history: ChatMessage[] = [...messages, { role: "user", content: q }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const system = groundedSystem(analysis);
        await streamCopilot(system, history, { apiKey, signal: ctrl.signal }, (delta) => {
          setMessages((prev) => {
            const next = prev.slice();
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + delta };
            return next;
          });
        });
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [apiKey, messages, analysis, streaming],
  );

  const provider = apiKey.trim() ? pickProvider(apiKey) : null;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-200">Copilot</h2>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder="Anthropic (sk-ant-) or Gemini key"
            className="w-60 rounded-lg border border-zinc-700 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none"
          />
          {provider && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{provider}</span>
          )}
        </div>
      </div>

      <p className="mb-3 text-[11px] text-zinc-500">
        Grounded in the analysis above. Your key stays in your browser: it is sent only to {provider ?? "your chosen provider"}, never to us.
      </p>

      <div ref={scrollRef} className="max-h-96 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!apiKey.trim()}
                onClick={() => void ask(s)}
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <div
                className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-blue-500/20 text-blue-100" : "bg-zinc-800/70 text-zinc-200"
                }`}
              >
                {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          ))
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={apiKey.trim() ? "Ask about this capture…" : "Enter an API key to ask"}
          disabled={!apiKey.trim() || streaming}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none disabled:opacity-50"
        />
        {streaming ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || !apiKey.trim()}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
          >
            Ask
          </button>
        )}
      </form>
    </section>
  );
}
