/**
 * En-têtes « navigateur » partagés entre le fetch HTTP (undici) et le fallback Puppeteer.
 */

/** Accept header as sent by Chrome for a top-level document (incl. signed-exchange). */
const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";

/** Chrome 146 on Windows — match a real browser fingerprint for sec-ch-ua. */
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

const DEFAULT_SEC_CH_UA =
  '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"';

export function resolveFetchProxyUri(): string | undefined {
  return (
    process.env.FETCH_HTTP_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim()
  );
}

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
        "[browserLikeHeaders] FETCH_EXTRA_HEADERS is not valid JSON — ignored.",
      );
    }
  }

  return headers;
}
