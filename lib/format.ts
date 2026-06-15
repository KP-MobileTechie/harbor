// ---------------------------------------------------------------------------
// format.ts — tiny presentation helpers shared by the dashboard components.
// Pure, browser + node safe.
// ---------------------------------------------------------------------------

/** Human-readable bytes: B / KB / MB. */
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human-readable milliseconds: ms / s. */
export function fmtMs(n: number): string {
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}
