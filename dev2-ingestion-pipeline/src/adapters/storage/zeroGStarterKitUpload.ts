/**
 * Helpers aligned with 0g-storage-ts-starter-kit (src/storage.ts + src/config.ts).
 * @see https://github.com/0gfoundation/0g-storage-ts-starter-kit/tree/master/scripts
 */

import { Indexer } from "@0gfoundation/0g-ts-sdk";

const DEFAULT_TESTNET_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

/** SDK upload retry options (seconds between attempts = Interval). */
export type StarterKitRetryOpts = {
  Retries: number;
  Interval: number;
  MaxGasPrice: number;
};

/**
 * Retry opts for `indexer.upload` (5th arg), same shape as the starter kit.
 * Default: 5 retries / 5s interval (starter kit only sets this when MAX_RETRIES is in .env;
 * we default it here to harden segment uploads). Set `ZEROG_UPLOAD_MAX_RETRIES=0` to omit
 * and let the SDK use its internal defaults.
 */
export function buildRetryOptsFromEnv(): StarterKitRetryOpts | undefined {
  const raw = process.env.ZEROG_UPLOAD_MAX_RETRIES ?? process.env.MAX_RETRIES;
  if (raw === "0") {
    return undefined;
  }
  const Retries =
    raw !== undefined && raw !== ""
      ? Math.max(1, parseInt(raw, 10) || 5)
      : 5;
  const Interval = Math.max(
    1,
    parseInt(process.env.ZEROG_UPLOAD_RETRY_INTERVAL_SEC ?? "5", 10) || 5,
  );
  const maxGas = process.env.ZEROG_MAX_GAS_PRICE ?? process.env.MAX_GAS_PRICE;
  const MaxGasPrice = maxGas ? Number(maxGas) : 0;
  return { Retries, Interval, MaxGasPrice };
}

/** Same as starter kit `buildTxOpts` — gas for Flow.submit via uploader. */
export function buildTxOptsFromEnv(): { gasPrice?: bigint; gasLimit?: bigint } | undefined {
  const gp = process.env.ZEROG_GAS_PRICE ?? process.env.GAS_PRICE;
  const gl = process.env.ZEROG_GAS_LIMIT ?? process.env.GAS_LIMIT;
  const opts: { gasPrice?: bigint; gasLimit?: bigint } = {};
  if (gp) opts.gasPrice = BigInt(gp);
  if (gl) opts.gasLimit = BigInt(gl);
  return Object.keys(opts).length > 0 ? opts : undefined;
}

/** Poll interval / timeout after upload until indexer_getFileLocations returns nodes (required for download). */
export function buildIndexerSyncWaitFromEnv(): { timeoutMs: number; intervalMs: number } {
  const timeoutMs = Math.max(
    5000,
    parseInt(process.env.ZEROG_INDEXER_SYNC_TIMEOUT_MS ?? "120000", 10) || 120_000,
  );
  const intervalMs = Math.max(
    500,
    parseInt(process.env.ZEROG_INDEXER_SYNC_INTERVAL_MS ?? "3000", 10) || 3000,
  );
  return { timeoutMs, intervalMs };
}

/**
 * Ordered list of indexer RPC URLs.
 * - If `ZEROG_INDEXER_URLS` is set (comma-separated), use that order (first = upload + primary poll).
 * - Else: `primary` + optional `ZEROG_INDEXER_FALLBACK_URLS` (comma-separated), de-duplicated.
 *
 * Lets you poll **turbo + standard** (or several endpoints) so you do not depend on a single
 * indexer returning empty `getFileLocations` while another already indexed the file.
 */
export function parseIndexerUrlCandidates(primary: string): string[] {
  const multi = process.env.ZEROG_INDEXER_URLS?.trim();
  if (multi) {
    const list = multi
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return [...new Set(list)];
  }
  const fallbacks =
    process.env.ZEROG_INDEXER_FALLBACK_URLS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return [...new Set([primary, ...fallbacks])];
}

/**
 * Block until **any** indexer in `indexerUrls` reports ≥1 storage node for `rootHash`, then
 * return an `Indexer` bound to that working base URL (use it for `download`).
 */
export async function waitUntilAnyIndexerHasLocations(
  indexerUrls: string[],
  rootHash: string,
  label = "indexer sync",
): Promise<Indexer> {
  if (indexerUrls.length === 0) {
    throw new Error("[0G] No indexer URLs configured (ZEROG_INDEXER_URL / ZEROG_INDEXER_URLS).");
  }

  const { timeoutMs, intervalMs } = buildIndexerSyncWaitFromEnv();
  const started = Date.now();
  let round = 0;

  for (;;) {
    round++;
    for (const url of indexerUrls) {
      const indexer = new Indexer(url);
      const locs = await indexer.getFileLocations(rootHash).catch(() => null);
      if (locs && locs.length > 0) {
        const elapsed = Date.now() - started;
        console.log(
          `[0G] ${label}: ${locs.length} location(s) for ${rootHash.slice(0, 18)}… via ${url} (${elapsed}ms, round ${round})`,
        );
        return indexer;
      }
    }

    if (Date.now() - started >= timeoutMs) {
      throw new Error(
        `[0G] None of the indexers returned storage locations for ${rootHash} within ${timeoutMs}ms (${label}). ` +
          `URLs tried: ${indexerUrls.join(" | ")}. ` +
          `Add ZEROG_INDEXER_FALLBACK_URLS (e.g. standard + turbo testnet), or set ZEROG_INDEXER_URLS, ` +
          `or increase ZEROG_INDEXER_SYNC_TIMEOUT_MS. ` +
          `Docs: https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
