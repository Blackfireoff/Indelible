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
 * Fallback: if a plain fetch gets HTTP 401/402/403, we retry with a headless Chromium browser
 * (Puppeteer) which uses the **same** env (cookies, referer, proxy) via `browserLikeHeaders`.
 */
import { fetch, ProxyAgent, type Dispatcher } from "undici";
import { buildBrowserLikeHeaders, resolveFetchProxyUri } from "./browserLikeHeaders";
import { fetchWithBrowser } from "./fetchWithBrowser";

export interface FetchResult {
  /** The exact raw response body */
  body: string;
  /** The content-type header from the response */
  contentType: string;
  /** HTTP status code */
  status: number;
}

export { buildBrowserLikeHeaders } from "./browserLikeHeaders";

/** HTTP status codes that trigger a browser fallback instead of a hard failure. */
const BROWSER_FALLBACK_STATUSES = new Set([401, 402, 403]);

function resolveProxyDispatcher(): Dispatcher | undefined {
  const uri = resolveFetchProxyUri();
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
 * 2. If the server returns 401/402/403, fall back to headless Chromium (same cookies/proxy as env).
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

  // ── Auth / paywall / bot block: fall back to headless browser ──
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
