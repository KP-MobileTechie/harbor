"use client";

// ---------------------------------------------------------------------------
// ThirdParties.tsx — a ranked list of every third-party origin the page talked
// to, with its category, request count, bytes, total time, and whether it
// received cookies or query parameters (signals worth knowing before you trust
// a vendor with your users' data).
// ---------------------------------------------------------------------------

import type { ThirdParty, TPCategory } from "@/lib/har/thirdparty";
import { fmtBytes, fmtMs } from "@/lib/format";

const CATEGORY_STYLE: Record<TPCategory, string> = {
  analytics: "bg-violet-500/15 text-violet-300",
  ads: "bg-red-500/15 text-red-300",
  "tag-manager": "bg-amber-500/15 text-amber-300",
  cdn: "bg-blue-500/15 text-blue-300",
  social: "bg-sky-500/15 text-sky-300",
  fonts: "bg-emerald-500/15 text-emerald-300",
  unknown: "bg-zinc-700/40 text-zinc-300",
};

export function ThirdParties({ items }: { items: ThirdParty[] }) {
  if (!items.length) {
    return <p className="text-sm text-zinc-500">No third-party requests. This page only talked to its own origin.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((tp) => (
        <li key={tp.domain} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${CATEGORY_STYLE[tp.category]}`}>
                {tp.category}
              </span>
              <span className="truncate font-mono text-sm text-zinc-200" title={tp.domain}>{tp.domain}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-zinc-400">
              <span>{tp.requests} req</span>
              <span>{fmtBytes(tp.bytes)}</span>
              <span>{fmtMs(tp.timeMs)}</span>
            </div>
          </div>
          {(tp.sentCookies || tp.sentQueryParams) && (
            <div className="mt-1.5 flex flex-wrap gap-2 text-[10px]">
              {tp.sentCookies && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">sent cookies</span>}
              {tp.sentQueryParams && <span className="rounded bg-zinc-700/40 px-1.5 py-0.5 text-zinc-300">sent query params</span>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
