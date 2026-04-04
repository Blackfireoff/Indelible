/**
 * Helpers aligned with 0g-storage-ts-starter-kit (src/storage.ts + src/config.ts).
 * @see https://github.com/0gfoundation/0g-storage-ts-starter-kit/tree/master/scripts
 */

import type { Indexer } from "@0gfoundation/0g-ts-sdk";

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
 * Block until the indexer reports at least one storage node for this root, or timeout.
 * Required for `indexer.download` / verify step; otherwise getFileLocations stays empty
 * for minutes after a successful on-chain + segment upload.
 */
export async function waitUntilIndexerHasLocations(
  indexer: Indexer,
  rootHash: string,
  label = "indexer sync",
): Promise<void> {
  const { timeoutMs, intervalMs } = buildIndexerSyncWaitFromEnv();
  const started = Date.now();
  let attempt = 0;
  for (;;) {
    attempt++;
    const locs = await indexer.getFileLocations(rootHash).catch(() => null);
    if (locs && locs.length > 0) {
      const elapsed = Date.now() - started;
      console.log(
        `[0G] ${label}: ${locs.length} location(s) for ${rootHash.slice(0, 18)}… (${elapsed}ms, attempt ${attempt})`,
      );
      return;
    }
    if (Date.now() - started >= timeoutMs) {
      throw new Error(
        `[0G] Indexer did not return storage locations for ${rootHash} within ${timeoutMs}ms (${label}). ` +
          `Check ZEROG_INDEXER_URL (turbo vs standard), increase ZEROG_INDEXER_SYNC_TIMEOUT_MS, or retry later. ` +
          `Docs: https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
