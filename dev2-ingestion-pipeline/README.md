# Indelible – Dev 2: HTML Ingestion Pipeline

Transforms a raw HTML capture produced by Dev 1 into a structured, searchable, evidence-preserving corpus stored in 0G Storage.

## What it produces

| Artifact | Purpose |
|---|---|
| `clean_article.json` | Cleaned article text, ordered paragraphs, provenance |
| `statements.json` | Exact political statements (LLM extraction depuis `clean_article`, puis validation) |
| `verified_statements.json` | Même contenu ramené au schéma refined (`extracted_by: "llm"`) avec preuves de spans |
| `retrieval_chunks.json` | Statement + paragraph chunks for semantic retrieval |
| `embeddings.json` | Embedding vectors for all chunks (local model or stub) |
| `document_manifest.json` | Entry point linking all artifacts via 0G data addresses |

## Architecture

```
raw HTML (Dev 1)
    │
    ▼
extractMainArticle       ← Mozilla Readability + jsdom + fallback DOM walk
    │                       Unicode invisible chars stripped (Reuters-safe)
    ▼
buildCleanArticle        ← ordered paragraphs, clean text, offsets, provenance
    │
    ▼
extractStatementsFromCleanArticle  ← LLM (local ou 0G) sur JSON paragraphes, pas HTML
    │
    ▼
validateStatements       ← exact substring verification (non-negotiable)
    │
    ▼
filterConservativeStatements
    │
    ▼
deterministicStatementsToRefined(llm)  ← statements → verified_statements (schéma refined)
    │
    ▼
buildRetrievalChunks     ← statement chunks + paragraph chunks
    │
    ▼
generateEmbeddings       ← local model (all-MiniLM-L6-v2) or zero-vector stub
    │
    ▼
uploadArtifacts          ← 0G Storage (or mock local files)
    │
    ▼
buildDocumentManifest    ← links all artifact addresses
```

## Project structure

```
/dev2-ingestion-pipeline
  /src
    /adapters
      /storage
        StorageAdapter.ts          ← interface
        ZeroGStorageAdapter.ts     ← real 0G Storage
        MockStorageAdapter.ts      ← local files for dev/test
      /embedding                   ← (reserved for future embedding adapters)
      /llm                         ← (reserved for future LLM adapters)
    /pipeline
      loadRawCapture.ts
      extractMainArticle.ts
      buildCleanArticle.ts
      llmShared.ts
      llmExtractStatements.ts   ← statements depuis clean_article (LLM)
      extractStatements.ts      ← extracteur à règles (tests / scripts uniquement)
      validateStatements.ts
      buildRetrievalChunks.ts
      generateEmbeddings.ts
      uploadArtifacts.ts
      buildDocumentManifest.ts
      llmRefinement.ts             ← (optionnel) second passage refined — non utilisé par le job par défaut
      verifyRefinedStatements.ts   ← helpers refined + conversion Statement → VerifiedRefinedStatement
    /schemas                       ← TypeScript types for all artifacts
    /utils
      ids.ts                       ← deterministic SHA-256-based IDs
      speakerNormalization.ts      ← slug normalization + alias map
      offsets.ts                   ← char span utilities
      html.ts                      ← HTML cleaning utilities
      json.ts                      ← JSON I/O helpers
    /fixtures
      sample-article.html          ← representative political article
      sample-raw-capture.json      ← Dev 1 input fixture
      loadReutersFixture.ts        ← Reuters integration test helper
    /tests
      utils.test.ts
      articleExtraction.test.ts
      statements.test.ts
      embeddings.test.ts
      storage.test.ts
      manifest.test.ts
      pipeline.e2e.test.ts
      reuters.e2e.test.ts          ← mandatory Reuters example.html fixture tests
  index.ts                         ← pipeline entry point
  package.json
  tsconfig.json
  jest.config.cjs
  .env.example
```

## Quick start

### 1. Install

```bash
cd dev2-ingestion-pipeline
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env – set OPENAI_API_KEY and ZEROG_* if using real storage
```

### 3. Run (mock storage, local file input)

**bash / macOS / Linux / Git Bash:**

```bash
RAW_CAPTURE_PATH=./src/fixtures/sample-raw-capture.json npm run pipeline
```

**Windows PowerShell** (les variables d’environnement ne se passent pas comme sous Unix) :

```powershell
$env:RAW_CAPTURE_PATH = ".\src\fixtures\sample-raw-capture.json"; npm run pipeline
```

**Windows CMD :**

```cmd
set RAW_CAPTURE_PATH=.\src\fixtures\sample-raw-capture.json && npm run pipeline
```

Output artifacts are written to `./output/`.

### 4. Run tests

```bash
npm test
```

All tests run without any API keys (embeddings use zero-vector stub, no LLM call).
The mandatory Reuters `example.html` fixture test is included.

### 5. Run with local LLM refinement (LM Studio)

See the [LM Studio section](#running-with-a-local-llm-lm-studio) below for full instructions.

### 5. Run with 0G Storage

**bash:**

```bash
STORAGE_ADAPTER=zerog \
ZEROG_PRIVATE_KEY=0xYOUR_KEY \
RAW_CAPTURE_PATH=./src/fixtures/sample-raw-capture.json \
npm run pipeline
```

**PowerShell:**

```powershell
$env:STORAGE_ADAPTER = "zerog"
$env:ZEROG_PRIVATE_KEY = "0xYOUR_KEY"
$env:RAW_CAPTURE_PATH = ".\src\fixtures\sample-raw-capture.json"
npm run pipeline
```

### 6. Load raw capture from 0G

**bash:**

```bash
STORAGE_ADAPTER=zerog \
ZEROG_PRIVATE_KEY=0xYOUR_KEY \
RAW_CAPTURE_DATA_ADDRESS=0xABC123... \
npm run pipeline
```

**PowerShell:**

```powershell
$env:STORAGE_ADAPTER = "zerog"; $env:ZEROG_PRIVATE_KEY = "0xYOUR_KEY"; $env:RAW_CAPTURE_DATA_ADDRESS = "0xABC123..."; npm run pipeline
```

## Running with a local LLM (LM Studio)

**Statement extraction** (`statements.json`) est produite par le LLM à partir du JSON
`clean_article` (fenêtres de paragraphes). Sans endpoint joignable, l’extraction renvoie
zéro statement (logs d’avertissement). Aucun HTML n’est envoyé au modèle.

### Setup

1. Download [LM Studio](https://lmstudio.ai/) and install it.
2. Download a model – recommended: **`qwen2.5-7b-instruct`** (good instruction
   following, ~4 GB, fast on CPU/GPU).
3. In LM Studio → **Local Server** tab → load the model → click **Start Server**.
   Default URL: `http://127.0.0.1:1234/v1`.

### Configure `.env`

Les variables `LLM_REFINEMENT_*` / `LOCAL_LLM_*` configurent aussi l’extracteur (`llmExtractStatements.ts`).

```ini
LLM_REFINEMENT_PROVIDER=local
LOCAL_LLM_BASE_URL=http://127.0.0.1:1234/v1
LOCAL_LLM_API_KEY=lm-studio
LOCAL_LLM_MODEL=qwen2.5-7b-instruct
LOCAL_LLM_TIMEOUT_MS=60000
```

### Run

```powershell
npm run pipeline
```

The pipeline will:
1. Appeler le LLM sur des fenêtres de paragraphes (JSON `id` + `text`).
2. Parser la réponse JSON ; pour chaque ligne, vérifier que `content` est une sous-chaîne
   exacte (ou normalisée) du paragraphe — sinon la ligne est ignorée.
3. Exécuter `validateStatements` et le filtre d’attribution conservateur.
4. Écrire `verified_statements.json` via `deterministicStatementsToRefined(..., "llm")`
   (`extracted_by: "llm"`, spans alignés sur les `Statement` validés).

### What the LLM receives

The LLM is given a JSON object like:

```json
{
  "paragraphs": [
    { "id": "para_abc123", "text": "Clean paragraph text…" }
  ]
}
```

It is **never** given raw HTML, CSS, JavaScript, or any markup.

### What the LLM must return (extraction statements)

Le prompt demande un objet `{ "statements": [ … ] }` avec notamment `content`, `speaker`,
`source_paragraph_id`, `quote_type`, `cue`, `confidence` — voir `llmExtractStatements.ts`.

### Vérifications côté pipeline

Les énoncés qui ne se retrouvent pas dans le texte source après parsing sont **rejetés**
avant `statements.json`. Le schéma `verified_statements` repose sur les spans validés
dans `statements.json` (tous marqués `verification_method: "exact_match"` à l’export refined).

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `STORAGE_ADAPTER` | `mock` | `mock` or `zerog` |
| `OUTPUT_DIR` | `./output` | Mock storage output directory |
| `SAVE_ARTIFACTS_BEFORE_UPLOAD` | — | Set to `true` to write all pipeline JSON files under `OUTPUT_DIR`/`LOCAL_ARTIFACTS_SUBDIR` before upload |
| `LOCAL_ARTIFACTS_SUBDIR` | `local-artifacts` | Subfolder for local copies (when `SAVE_ARTIFACTS_BEFORE_UPLOAD=true`) |
| `RAW_CAPTURE_PATH` | `./src/fixtures/sample-raw-capture.json` | Local raw capture file |
| `RAW_CAPTURE_DATA_ADDRESS` | — | 0G data address (overrides PATH) |
| `ZEROG_RPC_URL` | `https://evmrpc-testnet.0g.ai` | 0G EVM RPC endpoint |
| `ZEROG_INDEXER_URL` | `https://indexer-storage-testnet-turbo.0g.ai` | 0G storage indexer |
| `ZEROG_PRIVATE_KEY` | — | Signing key for 0G uploads |
| `ZEROG_UPLOAD_MINIFY_JSON` | — | Set `true` to compact JSON before 0G upload (new Merkle root; helps avoid stale artifact dedup) |
| `ZEROG_UPLOAD_PAD_MIN_BYTES` | `2048` | Minimum UTF-8 length before padding spaces |
| `LLM_REFINEMENT_PROVIDER` | `local` | `local` (OpenAI-compatible) ou `0g` (0G Compute) pour l’extraction des statements |
| `LOCAL_LLM_BASE_URL` | `http://127.0.0.1:1234/v1` | OpenAI-compatible endpoint |
| `LOCAL_LLM_API_KEY` | `lm-studio` | API key (any string for LM Studio) |
| `LOCAL_LLM_MODEL` | `local-model` | Model identifier |
| `LOCAL_LLM_TIMEOUT_MS` | `60000` | Request timeout in ms |
| `EMBEDDING_PROVIDER` | `local` | `local`, `stub`, or `openai` |
| `LOCAL_EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Local embedding model |
| `OPENAI_API_KEY` | — | Only needed for `EMBEDDING_PROVIDER=openai` |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model |

## Non-negotiable rules

1. `content` in `statements.json` is always an **exact verbatim substring** of the source paragraph text.
2. Statements that cannot be verified as exact substrings are **rejected**, not accepted.
3. All IDs (paragraph, statement, chunk) are **deterministic** — same input always produces the same IDs.
4. Speaker normalization is **deterministic** — `"Donald Trump"` → `"donald_trump"` always.
5. Every statement includes exact `charStart`/`charEnd` offsets validated against the paragraph text.
6. The pipeline is **HTML-only**. No PDF, no transcript, no OCR.

## Input contract (Dev 1)

```json
{
  "schemaVersion": "1.0",
  "attestationId": "0xabc123...",
  "requestId": "0xdef456...",
  "sourceUrl": "https://example.com/article",
  "observedAt": "2026-04-04T12:00:00Z",
  "contentType": "text/html",
  "rawHash": "0x987654...",
  "dataBrut": "<html>...</html>"
}
```

## Statement extraction strategy

**LLM (`extractStatementsFromCleanArticle`):**
- Receives clean JSON with paragraph `id` / `text` (NOT raw HTML)
- Fenêtres glissantes de paragraphes (taille configurable via `LlmRefinementConfig` / défaut dans `llmShared`)
- The model returns `content` + `speaker` + `source_paragraph_id`, etc.; chaque ligne est
  résolue en spans dans le paragraphe (`findExactSpan` / `findNormalizedSpan`) puis convertie en `Statement`

**Après extraction :**
- `validateStatements` + `filterConservativeStatements`
- `verified_statements.json` = `deterministicStatementsToRefined(statements, "llm")`

**Legacy – `extractStatements.ts` (rules + optional LLM fallback dans ce module):**
- Conservé pour tests Jest et scripts ; **non utilisé** par `runIngestionJob`.

## 0G Storage adapter

The `ZeroGStorageAdapter` uses `@0gfoundation/0g-ts-sdk` aligned with the official [0g-storage-ts-starter-kit](https://github.com/0gfoundation/0g-storage-ts-starter-kit/tree/master/scripts) (`upload.ts` / `uploadData` in `src/storage.ts`):
- Upload: write padded JSON to a temp file → `ZgFile.fromFilePath` → `indexer.upload(file, rpcUrl, signer, uploadOpts, retryOpts, txOpts)` → **poll `indexer_getFileLocations` until the indexer lists storage nodes** (or timeout) → returns root hash as `dataAddress`
- Small files are padded to ≥ 2 KB (storage node preference); optional env: `ZEROG_UPLOAD_MAX_RETRIES`, `ZEROG_GAS_PRICE`, `ZEROG_GAS_LIMIT`, `ZEROG_INDEXER_SYNC_TIMEOUT_MS`, `ZEROG_INDEXER_SYNC_INTERVAL_MS` (see `.env.example`)
- Download: **`waitUntilAnyIndexerHasLocations`** polls every URL in `ZEROG_INDEXER_URLS` or `ZEROG_INDEXER_URL` + `ZEROG_INDEXER_FALLBACK_URLS` until one indexer returns storage nodes, then `indexer.download` on that endpoint → read → `trimEnd()` (drop padding)
- The Flow contract is auto-discovered from the indexer (no manual ABI patching needed)

The `dataAddress` in `document_manifest.json` is the 0G Merkle root hash for each artifact.

### Why some artifacts fail on 0G while embeddings / manifest work

- **Embeddings** and **document_manifest** usually change every pipeline run (vectors + new 0G addresses), so the **Merkle root is new** each time. The SDK performs a full upload path and indexers tend to list locations.
- **clean_article**, **statements**, **chunks**, etc. can be **byte-for-byte identical** across runs (same fixture / same article). The root hash matches **older submissions** that may be in a bad state on nodes or missing from the indexer. The SDK may then short-circuit (`tasks.length === 0`) while downloads still see **no locations**.

**Mitigations** (optional, in `.env`):

| Variable | Effect |
|--------|--------|
| `ZEROG_UPLOAD_MINIFY_JSON=true` | `JSON.parse` → `JSON.stringify` (compact, no indentation). **Different bytes** than pretty-printed pipeline output → **new root** → avoids stale dedup with broken historical uploads. |
| `ZEROG_UPLOAD_PAD_MIN_BYTES` | Minimum size before upload (default `2048`). Raise only if you suspect segment-size edge cases. |

Downloads return whatever was stored (often **minified** JSON if minify was on). Local copies from `SAVE_ARTIFACTS_BEFORE_UPLOAD` stay **pretty-printed** from the pipeline.

## Dev 3 interface

Dev 3 should:
1. Load `document_manifest.json` by its known 0G address.
2. Use `artifacts.retrievalChunks.dataAddress` to retrieve `retrieval_chunks.json`.
3. Use `artifacts.embeddings.dataAddress` to retrieve `embeddings.json`.
4. Import vectors into a vector database for semantic search.
5. Use `artifacts.statements.dataAddress` for evidence display and comparison.
