/**
 * Fetch raw HTML (or other) from a public URL with browser-like headers so CDNs
 * (Akamai, etc.) are less likely to return 401/403 than a bare `User-Agent: Indelible`.
 *
 * Defaults align with a real Chrome navigation on the same site (`sec-fetch-site: same-origin`,
 * Accept line incl. signed-exchange) — see README for `FETCH_COOKIE` + `FETCH_REFERER`.
 *
 * Optional: `FETCH_HTTP_PROXY`, `HTTPS_PROXY`, or `HTTP_PROXY` — HTTP(S) proxy
 * (e.g. local mitmproxy, residential proxy). Uses `undici` `ProxyAgent`.
 *
 * Only the main document is requested (GET HTML). No subresource fetching.
 *
 * Fallback: if a plain fetch gets HTTP 402/403, we retry with a headless Chromium browser
 * (Puppeteer) which renders JS, handles cookies, and passes bot detection.
 */
import { fetch, ProxyAgent, type Dispatcher } from "undici";
import { fetchWithBrowser } from "./fetchWithBrowser";

export interface FetchResult {
  /** The exact raw response body */
  body: string;
  /** The content-type header from the response */
  contentType: string;
  /** HTTP status code */
  status: number;
}

/** Accept header as sent by Chrome for a top-level document (incl. signed-exchange). */
const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";

/** Chrome 146 on Windows — match a real browser fingerprint for sec-ch-ua. */
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

const DEFAULT_SEC_CH_UA =
  '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"';

/** HTTP status codes that trigger a browser fallback instead of a hard failure. */
const BROWSER_FALLBACK_STATUSES = new Set([402, 403]);

/**
 * Build request headers modeled on Chrome DevTools (same-origin navigation).
 * Set `FETCH_COOKIE` + `FETCH_REFERER` (page précédente sur le même host) for sites like Reuters.
 */
export function buildBrowserLikeHeaders(targetUrl: string): Record<string, string> {
  const ua = process.env.FETCH_USER_AGENT?.trim() || DEFAULT_USER_AGENT;

  let referer: string;
  try {
    const u = new URL(targetUrl);
    referer = process.env.FETCH_REFERER?.trim() || `${u.origin}/`;
  } catch {
    referer = "https://www.google.com/";
  }

  const siteMode = process.env.FETCH_SEC_FETCH_SITE?.trim();
  const secFetchSite =
    siteMode === "same-origin" ||
    siteMode === "same-site" ||
    siteMode === "cross-site" ||
    siteMode === "none"
      ? siteMode
      : "same-origin";

  const accept = process.env.FETCH_ACCEPT?.trim() || DEFAULT_ACCEPT;

  const headers: Record<string, string> = {
    "User-Agent": ua,
    Accept: accept,
    "Accept-Language":
      process.env.FETCH_ACCEPT_LANGUAGE?.trim() || "fr-FR,fr;q=0.9",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Cache-Control": "max-age=0",
    Priority: "u=0, i",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": secFetchSite,
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": process.env.FETCH_SEC_CH_UA?.trim() || DEFAULT_SEC_CH_UA,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    Referer: referer,
  };

  const cookie = process.env.FETCH_COOKIE?.trim();
  if (cookie) {
    headers.Cookie = cookie;
  }

  const extra = process.env.FETCH_EXTRA_HEADERS?.trim();
  if (extra) {
    try {
      const parsed = JSON.parse(extra) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k === "string" && typeof v === "string") {
          headers[k] = v;
        }
      }
    } catch {
      console.warn(
        "[fetchRawContent] FETCH_EXTRA_HEADERS is not valid JSON — ignored.",
      );
    }
  }

  return headers;
}

function resolveProxyDispatcher(): Dispatcher | undefined {
  const uri =
    process.env.FETCH_HTTP_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim();
  if (!uri) {
    return undefined;
  }
  console.log(`[fetchRawContent] Using HTTP proxy: ${uri.replace(/\/\/.*@/, "//***@")}`);
  return new ProxyAgent(uri);
}

/**
 * Fetch the raw content from a URL (HTML document only — no assets).
 *
 * Strategy:
 * 1. Try a fast plain HTTP fetch with browser-like headers.
 * 2. If the server returns 402 (paywall) or 403 (bot block), fall back
 *    to a real headless Chromium browser via Puppeteer.
 * 3. Throw on any other non-2xx status.
 */
export async function fetchRawContent(url: string): Promise<FetchResult> {
  const dispatcher = resolveProxyDispatcher();

  const response = await fetch(url, {
    method: "GET",
    headers: buildBrowserLikeHeaders(url),
    redirect: "follow",
    dispatcher,
  });

  // ── Happy path: 2xx ──
  if (response.ok) {
    const body = await response.text();
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    return { body, contentType, status: response.status };
  }

  // ── Paywall / bot block: fall back to headless browser ──
  if (BROWSER_FALLBACK_STATUSES.has(response.status)) {
    console.log(
      `[fetchRawContent] HTTP ${response.status} — falling back to headless browser for: ${url}`,
    );
    return fetchWithBrowser(url);
  }

  // ── Other errors: throw ──
  throw new Error(
    `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`,
  );
}

