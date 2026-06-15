"use client";

// ---------------------------------------------------------------------------
// Harbor dashboard. Drop or paste a .har file (or pick a sample) → parse +
// analyze in a Web Worker (so a large capture never freezes the UI) → render a
// summary header, the request waterfall, the weight breakdown, the third-party
// list, the privacy findings, and a grounded performance + privacy copilot.
// A one-click Markdown summary is downloadable. Nothing is ever uploaded.
// ---------------------------------------------------------------------------

import { useCallback, useState } from "react";
import { runParse } from "@/lib/har/runParse";
import { toMarkdown } from "@/lib/har/summary";
import { SAMPLES } from "@/lib/har/sample";
import type { ParseResult } from "@/lib/har/types";
import type { Analysis } from "@/lib/har/analyze";
import { fmtBytes, fmtMs } from "@/lib/format";
import { Waterfall } from "@/components/Waterfall";
import { WeightBreakdown } from "@/components/WeightBreakdown";
import { ThirdParties } from "@/components/ThirdParties";
import { Findings } from "@/components/Findings";
import { Copilot } from "@/components/Copilot";

interface Loaded {
  name: string;
  parse: ParseResult;
  analysis: Analysis;
}

export default function Home() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const process = useCallback(async (text: string, name: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { parse, analysis } = await runParse(text);
      setLoaded({ name, parse, analysis });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse that file. Is it a valid HAR capture?");
    } finally {
      setBusy(false);
    }
  }, []);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      const f = files?.[0];
      if (!f) return;
      await process(await f.text(), f.name);
    },
    [process],
  );

  if (!loaded) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 p-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Harbor</h1>
          <p className="mt-4 text-lg text-zinc-400">
            Drop a .har capture. See what's slow, what's heavy, who's tracking, and what's leaking.
          </p>
          <p className="mt-1 text-sm text-zinc-500">100% in your browser. Nothing uploaded.</p>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void onFiles(e.dataTransfer.files);
          }}
          className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-12 text-center transition ${
            dragging ? "border-blue-400 bg-blue-400/10" : "border-zinc-700 hover:border-zinc-500"
          }`}
        >
          <span className="text-zinc-300">Drop a .har file here, or click to choose</span>
          <span className="text-xs text-zinc-500">Exported from your browser DevTools Network tab</span>
          <input
            type="file"
            className="hidden"
            accept=".har,.json,application/json"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>

        <div className="w-full">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="…or paste HAR JSON here"
            rows={4}
            className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900/60 p-3 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={!paste.trim() || busy}
              onClick={() => void process(paste, "pasted.har")}
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Parsing…" : "Analyze"}
            </button>
            {error && <span className="text-sm text-red-400">{error}</span>}
          </div>
        </div>

        <div className="w-full">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Or try a sample</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => void process(s.make(), s.name)}
                className="rounded-xl border border-zinc-700 p-3 text-left transition hover:border-zinc-500 disabled:opacity-40"
              >
                <span className="block text-sm text-zinc-200">{s.label}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">{s.description}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return <Dashboard loaded={loaded} onReset={() => setLoaded(null)} />;
}

function downloadSummary(loaded: Loaded) {
  const md = toMarkdown(loaded.name, loaded.parse, loaded.analysis);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${loaded.name.replace(/\.[^.]+$/, "")}-summary.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-zinc-500">{hint}</div>}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Dashboard({ loaded, onReset }: { loaded: Loaded; onReset: () => void }) {
  const { name, parse, analysis: a } = loaded;
  const s = a.summary;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">
            Harbor <span className="text-zinc-600">·</span>{" "}
            <span className="text-zinc-300">{name}</span>
          </h1>
          <p className="mt-1 truncate text-xs text-zinc-500" title={parse.pageUrl || parse.primaryDomain}>
            {parse.pageUrl || parse.primaryDomain}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => downloadSummary(loaded)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500"
          >
            Download summary
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500"
          >
            New file
          </button>
        </div>
      </header>

      {/* Summary stat cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Requests" value={s.totalRequests.toLocaleString()} hint={`${s.errors} error${s.errors === 1 ? "" : "s"}`} />
        <Stat
          label="Transferred"
          value={fmtBytes(s.totalTransferBytes)}
          hint={`${fmtBytes(s.firstPartyBytes)} first · ${fmtBytes(s.thirdPartyBytes)} third`}
        />
        <Stat label="Load time" value={fmtMs(s.pageLoadMs)} hint={`critical path ${fmtMs(a.waterfall.criticalPathMs)}`} />
        <Stat label="Time to first byte" value={fmtMs(s.ttfbMs)} />
        <Stat label="Cache hit ratio" value={`${(s.cacheHitRatio * 100).toFixed(0)}%`} />
        <Stat label="Third parties" value={a.thirdParties.length.toLocaleString()} />
        <Stat
          label="Findings"
          value={a.privacy.length.toLocaleString()}
          hint={`${a.privacy.filter((f) => f.severity === "high").length} high severity`}
        />
        <Stat label="Render blocking" value={a.waterfall.renderBlocking.length.toLocaleString()} hint="CSS / JS before document" />
      </section>

      <Panel title="Waterfall" subtitle="Each request over the page load, segmented by timing phase. Slowest requests are highlighted.">
        <Waterfall data={a.waterfall} />
      </Panel>

      <Panel title="Page weight" subtitle="Where the transferred bytes go, by category, by domain, and the heaviest individual requests.">
        <WeightBreakdown data={a.weight} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Third parties" subtitle="Every external origin the page contacted.">
          <ThirdParties items={a.thirdParties} />
        </Panel>
        <Panel title="Privacy findings" subtitle="Leaked secrets, exposed PII, and tracker requests. Evidence is masked.">
          <Findings items={a.privacy} />
        </Panel>
      </div>

      <Copilot analysis={a} />

      <p className="pt-2 text-center text-[11px] text-zinc-600">Parsed entirely in your browser. Nothing was uploaded.</p>
    </main>
  );
}
