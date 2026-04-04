/**
 * Prepare payload bytes for 0G Storage upload.
 *
 * Why embeddings/manifest often "work" while clean_article/statements/chunks fail:
 * - Embeddings change every run → unique Merkle root → full segment upload + indexer path.
 * - Manifest includes new 0G addresses each run → unique root.
 * - Static artifacts (same HTML pipeline) → **same root hash** as older broken uploads →
 *   SDK may see nodes as "finalized" and skip tasks, while turbo indexer still has no
 *   locations for that root.
 *
 * Mitigations (env, all optional):
 * - ZEROG_UPLOAD_MINIFY_JSON: compact JSON → different bytes than pretty-printed
 *   (`JSON.stringify(..., null, 2)`), new root, avoids stale dedup.
 * - ZEROG_UPLOAD_PAD_MIN_BYTES: raise padding above 2 KiB to cross segment thresholds if needed.
 */

const DEFAULT_PAD_MIN = 2048;

export function prepareStringForZeroGUpload(data: string): { payload: string; minified: boolean } {
  let payload = data;
  let minified = false;

  if (process.env.ZEROG_UPLOAD_MINIFY_JSON === "true") {
    try {
      const parsed = JSON.parse(payload);
      payload = JSON.stringify(parsed);
      minified = true;
    } catch {
      /* not JSON — upload as-is */
    }
  }

  const minBytes = Math.max(
    DEFAULT_PAD_MIN,
    parseInt(process.env.ZEROG_UPLOAD_PAD_MIN_BYTES ?? String(DEFAULT_PAD_MIN), 10) ||
      DEFAULT_PAD_MIN,
  );

  if (payload.length < minBytes) {
    payload = payload.padEnd(minBytes, " ");
  }

  return { payload, minified };
}
