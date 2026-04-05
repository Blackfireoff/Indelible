/**
 * Headless-browser fallback for paywalled / bot-protected sites.
 *
 * Uses Puppeteer in headless mode — works on CLI-only Debian servers
 * (no X11 / display required). Chromium is bundled by Puppeteer.
 *
 * Réutilise les mêmes en-têtes / proxy / cookie que `fetchRawContent` (`browserLikeHeaders`)
 * pour éviter un navigateur « nu » alors que le fetch HTTP envoyait déjà `FETCH_COOKIE`.
 *
 * Launch flags include --no-sandbox (required for root/Docker)
 * and --disable-gpu (no GPU on headless servers).
 */
import puppeteer, { type Page } from "puppeteer";
import { buildBrowserLikeHeaders, resolveFetchProxyUri } from "./browserLikeHeaders";
import type { FetchResult } from "./fetchRawContent";

/** How long to wait for the page to be fully rendered (ms) */
const PAGE_TIMEOUT = 30_000;

/** How long to wait after load for JS-rendered content to settle (ms) */
const SETTLE_DELAY = 3_000;

async function applyBrowserLikeHeadersToPage(page: Page, targetUrl: string): Promise<void> {
  const h = buildBrowserLikeHeaders(targetUrl);
  const ua = h["User-Agent"];
  delete h["User-Agent"];
  delete h["Accept-Encoding"];
  await page.setUserAgent(ua);
  await page.setExtraHTTPHeaders(h);
}

/**
 * Fetch a URL using a real headless Chromium browser.
 * Returns the fully-rendered HTML after JS execution.
 */
export async function fetchWithBrowser(url: string): Promise<FetchResult> {
  console.log(`[fetchWithBrowser] Launching headless Chromium for: ${url}`);

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() ||
    process.env.CHROME_PATH?.trim() ||
    undefined;

  const proxyUri = resolveFetchProxyUri();
  if (proxyUri) {
    console.log(
      `[fetchWithBrowser] Chromium proxy: ${proxyUri.replace(/\/\/.*@/, "//***@")}`,
    );
  }

  const launchArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage", // Linux: /dev/shm trop petit en Docker
    "--disable-gpu",
    "--disable-software-rasterizer",
  ];
  // Sur Windows, --single-process / --no-zygote font souvent crasher Chromium →
  // « Navigating frame was detached » + processus introuvable. On les garde pour Linux/Docker.
  if (process.platform !== "win32") {
    launchArgs.push("--single-process", "--no-zygote");
  }
  if (proxyUri) {
    launchArgs.push(`--proxy-server=${proxyUri}`);
  }

  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: launchArgs,
  });

  browser.on("disconnected", () => {
    console.warn("[fetchWithBrowser] Browser disconnected unexpectedly (crash or kill).");
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({ width: 1920, height: 1080 });
    await applyBrowserLikeHeadersToPage(page, url);

    // Navigate and wait for the network to settle
    let httpStatus = 200;

    page.on("response", (response) => {
      // Capture the status of the main document request
      if (response.url() === url || response.url().startsWith(url.split("?")[0])) {
        httpStatus = response.status();
      }
    });

    // `networkidle2` rarement atteint sur les gros sites (analytics, SSE) et peut
    // contribuer aux erreurs « frame detached » ; `load` + délai ci-dessous suffit en général.
    const waitUntil =
      process.env.FETCH_BROWSER_WAIT_UNTIL === "networkidle2"
        ? "networkidle2"
        : "load";
    await page.goto(url, {
      waitUntil,
      timeout: PAGE_TIMEOUT,
    });

    // Wait a bit more for any JS-rendered content to appear
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY));

    // Auto-dismiss cookie consent banners (common on French news sites)
    try {
      // Try common consent button selectors
      const consentSelectors = [
        'button[id*="accept"]',
        'button[class*="accept"]',
        'button[class*="consent"]',
        'button[aria-label*="accepter"]',
        'button[aria-label*="Accept"]',
        '#didomi-notice-agree-button',
        '.didomi-continue-without-agreeing',
        '[data-testid="cookie-policy-dialog-accept-button"]',
      ];

      for (const selector of consentSelectors) {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          console.log(`[fetchWithBrowser] Clicked consent button: ${selector}`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          break;
        }
      }
    } catch {
      // Consent handling is best-effort
    }

    // Try scrolling down to trigger lazy-loaded content
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get the fully rendered HTML
    const body = await page.content();
    const contentType = "text/html";

    console.log(`[fetchWithBrowser] Got ${body.length} bytes (status: ${httpStatus})`);

    return {
      body,
      contentType,
      status: httpStatus,
    };
  } finally {
    await browser.close();
  }
}
