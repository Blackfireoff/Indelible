import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

/**
 * Écrit les JSON du pipeline sur disque :
 * 1. Si `archiveDir` est fourni → `archives/<run>/…` (voir `localArtifactArchive.ts`)
 * 2. Si `SAVE_ARTIFACTS_BEFORE_UPLOAD=true` → aussi `./output/local-artifacts/` (comportement historique plat)
 */

export function savePipelineJson(
  fileName: string,
  data: string,
  archiveDir: string | null | undefined,
): void {
  if (archiveDir) {
    mkdirSync(archiveDir, { recursive: true });
    const archivedPath = join(archiveDir, fileName);
    writeFileSync(archivedPath, data, "utf-8");
    console.log(`[archive] ${fileName} → ${archivedPath}`);
  }

  if (process.env.SAVE_ARTIFACTS_BEFORE_UPLOAD === "true") {
    const base = process.env.OUTPUT_DIR ?? "./output";
    const sub = process.env.LOCAL_ARTIFACTS_SUBDIR ?? "local-artifacts";
    const dir = resolve(process.cwd(), base, sub);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, fileName);
    writeFileSync(filePath, data, "utf-8");
    console.log(`[local] saved ${fileName} → ${filePath}`);
  }
}

/**
 * @deprecated Utiliser `savePipelineJson` avec `archiveDir` depuis `runIngestionJob`.
 * Conservé pour tout appel direct qui ne passe pas par le pipeline archivé.
 */
export function saveArtifactLocallyIfEnabled(fileName: string, data: string): void {
  savePipelineJson(fileName, data, undefined);
}
