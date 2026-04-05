/**
 * Statement Hash Verifier
 *
 * Verifies that statements stored locally haven't been modified by comparing
 * their hashes with the authoritative on-chain version in 0G Storage.
 *
 * Flow:
 * 1. Load document manifests from local data/embeddings directories
 * 2. For each attestation, get the statements dataAddress from the manifest
 * 3. Fetch statements from 0G Storage using the dataAddress
 * 4. Compare hash of local statements with on-chain statements
 * 5. If hashes differ, the statement is abandoned and should NOT be fed to AI
 *
 * Usage:
 *   const verifier = await StatementVerifier.create();
 *   const verifiedIds = await verifier.getVerifiedStatementIds(attestationId);
 *   const chunks = scoredChunks.filter(c => verifiedIds.has(c.statementId));
 */

import { createHash } from "crypto";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

export interface Statement {
  statementId: string;
  content: string;
  speaker: {
    name: string;
    role: string | null;
    normalizedId: string;
  };
  quoteType: "direct" | "indirect" | "unattributed";
  sourceParagraphId: string;
  charStart: number;
  charEnd: number;
  confidence: number;
  validation: {
    status: "auto_accepted" | "needs_review" | "rejected";
    reviewRequired: boolean;
  };
}

export interface StatementsFile {
  schemaVersion: string;
  attestationId: string;
  requestId: string;
  sourceUrl: string;
  extractionPolicy: {
    allowParaphrases: boolean;
    preserveExactText: boolean;
    speakerAttributionRequired: boolean;
  };
  statements: Statement[];
}

export interface DocumentManifest {
  schemaVersion: string;
  attestationId: string;
  requestId: string;
  sourceUrl: string;
  publisher: string;
  language: string;
  observedAt: string;
  artifacts: {
    rawCapture: { fileName: string; dataAddress: string };
    cleanArticle: { fileName: string; dataAddress: string };
    statements: { fileName: string; dataAddress: string };
    retrievalChunks: { fileName: string; dataAddress: string };
    embeddings: { fileName: string; dataAddress: string };
  };
  processing: { dev2PipelineVersion: string; status: string };
}

export interface VerifiedStatementResult {
  statementId: string;
  verified: boolean;
  reason?: string;
}

/**
 * Compute SHA-256 hash of content (hex string).
 */
export function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Compute hash of statements array for comparison.
 * The hash is computed over the stringified statements to detect any modification.
 */
function computeStatementsHash(statements: Statement[]): string {
  // Sort by statementId for deterministic ordering
  const sorted = [...statements].sort((a, b) =>
    a.statementId.localeCompare(b.statementId)
  );
  return computeContentHash(JSON.stringify(sorted));
}

export class StatementVerifier {
  private readonly embeddingsDir: string;
  private readonly manifests: Map<string, DocumentManifest>;
  private readonly localStatements: Map<string, StatementsFile>;
  private readonly onChainStatements: Map<string, StatementsFile>;
  private readonly hashMismatches: Map<string, VerifiedStatementResult[]>;

  // Cache for verified statement IDs per attestation
  private readonly verifiedCache: Map<string, Set<string>>;
  private readonly abandonedCache: Map<string, VerifiedStatementResult[]>;

  private constructor(embeddingsDir: string) {
    this.embeddingsDir = embeddingsDir;
    this.manifests = new Map();
    this.localStatements = new Map();
    this.onChainStatements = new Map();
    this.hashMismatches = new Map();
    this.verifiedCache = new Map();
    this.abandonedCache = new Map();
  }

  /**
   * Factory: create and initialize the verifier by loading all manifests.
   */
  static async create(config: { embeddingsDir?: string } = {}): Promise<StatementVerifier> {
    const embeddingsDir = config.embeddingsDir ?? "data/embeddings";
    const verifier = new StatementVerifier(embeddingsDir);
    await verifier.loadAllManifests();
    return verifier;
  }

  /**
   * Load all document manifests from local directories.
   */
  private async loadAllManifests(): Promise<void> {
    if (!existsSync(this.embeddingsDir)) {
      console.log(`[StatementVerifier] Directory does not exist: ${this.embeddingsDir}`);
      return;
    }

    const entries = readdirSync(this.embeddingsDir);

    for (const entry of entries) {
      const fullPath = join(this.embeddingsDir, entry);

      if (!statSync(fullPath).isDirectory()) {
        continue;
      }

      await this.loadManifestFromDirectory(entry, fullPath);
    }

    console.log(`[StatementVerifier] Loaded ${this.manifests.size} manifests`);
  }

  /**
   * Load manifest and statements from a single directory.
   */
  private async loadManifestFromDirectory(dirName: string, dirPath: string): Promise<void> {
    const manifestPath = join(dirPath, "document_manifest.json");
    const statementsPath = join(dirPath, "statements.json");

    if (!existsSync(manifestPath)) {
      console.warn(`[StatementVerifier] No document_manifest.json in ${dirName}`);
      return;
    }

    if (!existsSync(statementsPath)) {
      console.warn(`[StatementVerifier] No statements.json in ${dirName}`);
      return;
    }

    try {
      // Load manifest
      const manifestContent = readFileSync(manifestPath, "utf-8");
      const manifest: DocumentManifest = JSON.parse(manifestContent);

      // Load local statements
      const statementsContent = readFileSync(statementsPath, "utf-8");
      const statementsFile: StatementsFile = JSON.parse(statementsContent);

      // Verify attestation IDs match
      if (manifest.attestationId !== statementsFile.attestationId) {
        console.warn(`[StatementVerifier] Attestation ID mismatch in ${dirName}`);
        return;
      }

      this.manifests.set(manifest.attestationId, manifest);
      this.localStatements.set(manifest.attestationId, statementsFile);

      console.log(`[StatementVerifier] Loaded ${statementsFile.statements.length} statements from ${dirName}`);
    } catch (error) {
      console.warn(`[StatementVerifier] Failed to load ${dirName}:`, error);
    }
  }

  /**
   * Get the manifest for an attestation.
   */
  getManifest(attestationId: string): DocumentManifest | undefined {
    return this.manifests.get(attestationId);
  }

  /**
   * Get the statements dataAddress from the manifest.
   */
  getStatementsDataAddress(attestationId: string): string | undefined {
    return this.manifests.get(attestationId)?.artifacts.statements.dataAddress;
  }

  /**
   * Fetch statements from 0G Storage using the dataAddress.
   */
  async fetchStatementsFrom0G(dataAddress: string): Promise<StatementsFile | null> {
    try {
      const { Indexer } = await import("@0glabs/0g-ts-sdk");
      const { tmpdir } = await import("os");
      const { randomBytes } = await import("crypto");
      const { join: pathJoin } = await import("path");

      const indexerUrl = process.env.ZEROG_INDEXER_URL ?? "https://indexer-storage-testnet-turbo.0g.ai";
      const indexer = new Indexer(indexerUrl);

      const tmpPath = pathJoin(tmpdir(), `indelible_statements_${randomBytes(8).toString("hex")}.json`);

      try {
        const err = await indexer.download(dataAddress, tmpPath, true);
        if (err !== null) {
          console.error(`[StatementVerifier] 0G download error: ${err}`);
          return null;
        }

        const content = readFileSync(tmpPath, "utf-8");
        return JSON.parse(content) as StatementsFile;
      } finally {
        try {
          const { unlinkSync } = await import("fs");
          unlinkSync(tmpPath);
        } catch {
          // ignore cleanup errors
        }
      }
    } catch (error) {
      console.error(`[StatementVerifier] Failed to fetch statements from 0G:`, error);
      return null;
    }
  }

  /**
   * Set on-chain statements for an attestation (e.g., after fetching from 0G).
   * This allows the verifier to compare hashes.
   */
  setOnChainStatements(attestationId: string, statements: StatementsFile): void {
    this.onChainStatements.set(attestationId, statements);
  }

  /**
   * Verify statements for an attestation by comparing local and on-chain hashes.
   * Returns a map of statementId -> verification result.
   */
  async verifyStatements(attestationId: string): Promise<Map<string, VerifiedStatementResult>> {
    const results = new Map<string, VerifiedStatementResult>();

    const localFile = this.localStatements.get(attestationId);
    const onChainFile = this.onChainStatements.get(attestationId);

    if (!localFile) {
      console.warn(`[StatementVerifier] No local statements for ${attestationId}`);
      return results;
    }

    if (!onChainFile) {
      // If no on-chain data, we can't verify - assume local is trustworthy
      console.log(`[StatementVerifier] No on-chain statements for ${attestationId}, using local`);
      for (const stmt of localFile.statements) {
        results.set(stmt.statementId, {
          statementId: stmt.statementId,
          verified: true,
          reason: "on-chain not available, using local",
        });
      }
      return results;
    }

    // Compute hashes
    const localHash = computeStatementsHash(localFile.statements);
    const onChainHash = computeStatementsHash(onChainFile.statements);

    console.log(`[StatementVerifier] ${attestationId} - Local hash: ${localHash.slice(0, 16)}...`);
    console.log(`[StatementVerifier] ${attestationId} - On-chain hash: ${onChainHash.slice(0, 16)}...`);

    if (localHash !== onChainHash) {
      console.warn(`[StatementVerifier] ${attestationId} - HASH MISMATCH! Local statements may have been modified.`);

      // Find which statements differ
      const localMap = new Map(localFile.statements.map(s => [s.statementId, s]));
      const onChainMap = new Map(onChainFile.statements.map(s => [s.statementId, s]));

      // Check each local statement
      for (const stmt of localFile.statements) {
        const onChainStmt = onChainMap.get(stmt.statementId);
        if (!onChainStmt) {
          results.set(stmt.statementId, {
            statementId: stmt.statementId,
            verified: false,
            reason: "statement not found on-chain (removed or modified)",
          });
        } else {
          const localStmtHash = computeContentHash(JSON.stringify(stmt));
          const onChainStmtHash = computeContentHash(JSON.stringify(onChainStmt));
          if (localStmtHash !== onChainStmtHash) {
            results.set(stmt.statementId, {
              statementId: stmt.statementId,
              verified: false,
              reason: "statement content modified (hash mismatch)",
            });
            console.warn(`[StatementVerifier] Statement ${stmt.statementId} modified: "${stmt.content.slice(0, 50)}..."`);
          } else {
            results.set(stmt.statementId, {
              statementId: stmt.statementId,
              verified: true,
              reason: "hash matches",
            });
          }
        }
      }

      // Check for statements only on-chain (not in local)
      for (const stmt of onChainFile.statements) {
        if (!localMap.has(stmt.statementId)) {
          results.set(stmt.statementId, {
            statementId: stmt.statementId,
            verified: false,
            reason: "statement exists on-chain but not in local (new statement not in local)",
          });
        }
      }

      // Store abandoned statements
      const abandoned = Array.from(results.values()).filter(r => !r.verified);
      this.abandonedCache.set(attestationId, abandoned);
    } else {
      console.log(`[StatementVerifier] ${attestationId} - Hash verification PASSED`);
      for (const stmt of localFile.statements) {
        results.set(stmt.statementId, {
          statementId: stmt.statementId,
          verified: true,
          reason: "hash matches",
        });
      }
    }

    return results;
  }

  /**
   * Get set of verified statement IDs for an attestation.
   * Queries 0G Storage if not already fetched.
   */
  async getVerifiedStatementIds(attestationId: string): Promise<Set<string>> {
    // Check cache first
    const cached = this.verifiedCache.get(attestationId);
    if (cached) {
      return cached;
    }

    const manifest = this.manifests.get(attestationId);
    if (!manifest) {
      console.warn(`[StatementVerifier] No manifest for ${attestationId}`);
      return new Set();
    }

    const dataAddress = manifest.artifacts.statements.dataAddress;

    // Fetch from 0G
    console.log(`[StatementVerifier] Fetching statements from 0G: ${dataAddress.slice(0, 20)}...`);
    const onChainStatements = await this.fetchStatementsFrom0G(dataAddress);

    if (onChainStatements) {
      this.setOnChainStatements(attestationId, onChainStatements);
    }

    // Verify and get results
    const verificationResults = await this.verifyStatements(attestationId);
    const verifiedIds = new Set<string>();

    for (const [stmtId, result] of verificationResults) {
      if (result.verified) {
        verifiedIds.add(stmtId);
      } else {
        console.warn(`[StatementVerifier] Abandoned statement ${stmtId}: ${result.reason}`);
      }
    }

    // Store in cache
    this.verifiedCache.set(attestationId, verifiedIds);
    this.abandonedCache.set(
      attestationId,
      Array.from(verificationResults.values()).filter(r => !r.verified)
    );

    console.log(`[StatementVerifier] ${attestationId}: ${verifiedIds.size} verified, ${verificationResults.size - verifiedIds.size} abandoned`);

    return verifiedIds;
  }

  /**
   * Get abandoned statements for an attestation (those that failed verification).
   */
  getAbandonedStatements(attestationId: string): VerifiedStatementResult[] {
    return this.abandonedCache.get(attestationId) ?? [];
  }

  /**
   * Get local statement IDs for an attestation (for debugging/testing).
   */
  getLocalStatementIds(attestationId: string): string[] {
    const file = this.localStatements.get(attestationId);
    return file?.statements.map(s => s.statementId) ?? [];
  }

  /**
   * Check if we have a manifest for an attestation.
   */
  hasManifest(attestationId: string): boolean {
    return this.manifests.has(attestationId);
  }

  /**
   * Get all attestation IDs we have manifests for.
   */
  getAttestationIds(): string[] {
    return Array.from(this.manifests.keys());
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let _defaultVerifier: StatementVerifier | null = null;

export async function getStatementVerifier(): Promise<StatementVerifier> {
  if (!_defaultVerifier) {
    _defaultVerifier = await StatementVerifier.create();
  }
  return _defaultVerifier;
}

export async function reloadStatementVerifier(): Promise<StatementVerifier> {
  _defaultVerifier = await StatementVerifier.create();
  return _defaultVerifier;
}
