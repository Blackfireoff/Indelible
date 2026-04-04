/**
 * Helpers aligned with 0g-storage-ts-starter-kit (src/storage.ts + src/config.ts).
 * @see https://github.com/0gfoundation/0g-storage-ts-starter-kit/tree/master/scripts
 */

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
