import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

/**
 * When `SAVE_ARTIFACTS_BEFORE_UPLOAD=true`, writes JSON to disk before 0G/mock upload
 * so you can inspect or diff artifacts without downloading from storage.
 *
 * - `OUTPUT_DIR` (default `./output`) — base directory
 * - `LOCAL_ARTIFACTS_SUBDIR` (default `local-artifacts`) — subfolder under OUTPUT_DIR
 */
export function saveArtifactLocallyIfEnabled(fileName: string, data: string): void {
  if (process.env.SAVE_ARTIFACTS_BEFORE_UPLOAD !== "true") {
    return;
  }
  const base = process.env.OUTPUT_DIR ?? "./output";
  const sub = process.env.LOCAL_ARTIFACTS_SUBDIR ?? "local-artifacts";
  const dir = resolve(process.cwd(), base, sub);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, fileName);
  writeFileSync(filePath, data, "utf-8");
  console.log(`[local] saved ${fileName} → ${filePath}`);
}
