import { mkdirSync } from "fs";
import { join, resolve } from "path";

/**
 * Dossiers d’archives locaux : un sous-dossier par exécution du pipeline pour tous les JSON
 * (raw_capture, clean_article, statements, …) en plus du stockage 0G/mock.
 *
 * - `LOCAL_ARTIFACT_ARCHIVE` — `true` par défaut (désactiver avec `false`)
 * - `OUTPUT_DIR` — racine (défaut `./output`) → `OUTPUT_DIR/archives/<runId>/`
 */

export function isLocalArtifactArchiveEnabled(): boolean {
  return process.env.LOCAL_ARTIFACT_ARCHIVE !== "false";
}

/** Caractères problématiques sous Windows / POSIX pour les noms de dossiers */
function sanitizeSegment(id: string): string {
  return id
    .replace(/[/\\:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 64);
}

/**
 * Crée `OUTPUT_DIR/archives/<YYYY-MM-DD_HHMMSS>_<attestation-sanitized>/` et retourne le chemin absolu.
 * `requestId` est réservé pour métadonnées ; l’unicité repose sur la date/heure + attestation.
 * Retourne `null` si l’archivage local est désactivé.
 */
export function createArchiveRunDir(attestationId: string, _requestId: string): string | null {
  if (!isLocalArtifactArchiveEnabled()) {
    return null;
  }

  console.log(`[archive] Creating archive directory for attestation ${attestationId}`);

  const base = process.env.OUTPUT_DIR ?? "./output";
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const att = sanitizeSegment(attestationId) || "unknown_attestation";
  const runId = `${date}_${time}_${att}`;

  const dir = resolve(process.cwd(), base, "embeddings", runId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function archiveRootLabel(archiveDir: string): string {
  const parts = archiveDir.split(/[/\\]/);
  return parts[parts.length - 1] ?? archiveDir;
}

/** Chemin du fichier méta dans un run d’archive */
export function archiveMetaPath(archiveDir: string): string {
  return join(archiveDir, "run_meta.json");
}
