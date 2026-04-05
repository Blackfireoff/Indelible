/**
 * Headless-browser fallback for paywalled / bot-protected sites.
 *
 * Uses Puppeteer in headless mode — works on CLI-only Debian servers
 * (no X11 / display required). Chromium is bundled by Puppeteer.
 *
 * Launch flags include --no-sandbox (required for root/Docker)
 * and --disable-gpu (no GPU on headless servers).
 */
import puppeteer from "puppeteer";
import type { FetchResult } from "./fetchRawContent";

/** How long to wait for the page to be fully rendered (ms) */
const PAGE_TIMEOUT = 30_000;

/** How long to wait after load for JS-rendered content to settle (ms) */
const SETTLE_DELAY = 3_000;

/**
 * Fetch a URL using a real headless Chromium browser.
 * Returns the fully-rendered HTML after JS execution.
 */
export async function fetchWithBrowser(url: string): Promise<FetchResult> {
  console.log(`[fetchWithBrowser] Launching headless Chromium for: ${url}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",  // Use /tmp instead of /dev/shm (limited on servers)
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--single-process",
      "--no-zygote",
    ],
  });

  try {
    const page = await browser.newPage();

    // Set a realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Set realistic browser headers (language, etc.)
    await page.setExtraHTTPHeaders({
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    // Navigate and wait for the network to settle
    let httpStatus = 200;

    page.on("response", (response) => {
      // Capture the status of the main document request
      if (response.url() === url || response.url().startsWith(url.split("?")[0])) {
        httpStatus = response.status();
      }
    });

    await page.goto(url, {
      waitUntil: "networkidle2",
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
