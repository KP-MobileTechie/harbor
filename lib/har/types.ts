// ---------------------------------------------------------------------------
// Harbor core types. A HarRequest is the normalized shape every analysis module
// consumes, so the engine never touches raw HAR JSON directly.
// ---------------------------------------------------------------------------

export type MimeCategory =
  | "document"
  | "script"
  | "stylesheet"
  | "image"
  | "font"
  | "xhr"
  | "media"
  | "other";

export interface Timings {
  blocked: number;
  dns: number;
  connect: number;
  ssl: number;
  send: number;
  wait: number;
  receive: number;
  total: number;
}

export interface Sizes {
  headersBytes: number;
  bodyBytes: number;
  transferBytes: number;
}

export interface HeaderKV {
  name: string;
  value: string;
}

export interface HarRequest {
  index: number;
  /** Offset from capture start, in ms. */
  startedMs: number;
  url: string;
  scheme: string;
  host: string;
  registrableDomain: string;
  path: string;
  method: string;
  status: number;
  statusText: string;
  httpVersion: string;
  mimeCategory: MimeCategory;
  isThirdParty: boolean;
  fromCache: boolean;
  timings: Timings;
  sizes: Sizes;
  reqHeaders: HeaderKV[];
  resHeaders: HeaderKV[];
  setCookies: string[];
  queryParams: string[];
  redirectUrl?: string;
}

export interface ParseResult {
  pageUrl: string;
  primaryDomain: string;
  startedMs: number;
  onContentLoadMs?: number;
  onLoadMs?: number;
  entries: HarRequest[];
  total: number;
  errors: number;
}
