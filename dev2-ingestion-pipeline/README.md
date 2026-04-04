# Indelible – Dev 2: HTML Ingestion Pipeline

Transforms a raw HTML capture produced by Dev 1 into a structured, searchable, evidence-preserving corpus stored in 0G Storage.

## What it produces

| Artifact | Purpose |
|---|---|
| `clean_article.json` | Cleaned article text, ordered paragraphs, provenance |
| `statements.json` | Exact political statements (deterministic extraction) |
| `verified_statements.json` | Verified statements with span proofs (deterministic + optional LLM) |
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
extractStatements        ← deterministic regex rules (always runs)
    │
    ▼
validateStatements       ← exact substring verification (non-negotiable)
    │
    ▼
[llmRefinement]          ← optional: local OpenAI-compatible endpoint (LM Studio)
    │                       sends clean JSON, NOT raw HTML
    │                       graceful fallback if endpoint unreachable
    ▼
verifyRefinedStatements  ← exact + normalized span verification
    │                       unverified LLM output → discarded
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
      extractStatements.ts
      validateStatements.ts
      buildRetrievalChunks.ts
      generateEmbeddings.ts
      uploadArtifacts.ts
      buildDocumentManifest.ts
    /pipeline
      llmRefinement.ts             ← local LLM refinement (LM Studio / any OpenAI-compat)
      verifyRefinedStatements.ts   ← exact + normalized span verification
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

The LLM refinement step is **entirely optional**.  The pipeline always completes in
deterministic-only mode.  The LLM only receives clean article JSON – never raw HTML.

### Setup

1. Download [LM Studio](https://lmstudio.ai/) and install it.
2. Download a model – recommended: **`qwen2.5-7b-instruct`** (good instruction
   following, ~4 GB, fast on CPU/GPU).
3. In LM Studio → **Local Server** tab → load the model → click **Start Server**.
   Default URL: `http://127.0.0.1:1234/v1`.

### Configure `.env`

```ini
ENABLE_LLM_REFINEMENT=true
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
1. Run the deterministic extraction (always).
2. Connect to LM Studio and run the LLM on the clean article JSON (paragraph windows).
3. Verify every LLM statement against the source text (exact or normalized span).
4. Discard any statement the LLM fabricated that cannot be grounded back to the text.
5. Produce `verified_statements.json` with `extracted_by: "llm_refinement"` markers.
6. **If LM Studio is not running**, log a warning and continue in deterministic-only mode.

### What the LLM receives

The LLM is given a JSON object like:

```json
{
  "paragraphs": [
    { "id": "para_abc123", "order": 1, "text": "Clean paragraph text…" }
  ]
}
```

It is **never** given raw HTML, CSS, JavaScript, or any markup.

### What the LLM must return

```json
{
  "statements": [
    {
      "speaker": "Donald Trump",
      "speaker_role": "U.S. President",
      "statement_text": "exact verbatim text from one of the paragraphs",
      "statement_type": "direct_quote",
      "attribution_text": "Trump said",
      "evidence_paragraph_ids": ["para_abc123"],
      "confidence": 0.9
    }
  ]
}
```

### Verification guarantee

Every statement where `statement_text` cannot be found in the referenced paragraphs
(exact or normalized) is **silently discarded** before writing `verified_statements.json`.
The field `verification_method` records how each statement was matched:

| `verification_method` | Meaning |
|---|---|
| `exact_match` | `statement_text` found verbatim |
| `normalized_match` | Found after stripping invisible Unicode + collapsing whitespace |
| `unverified` | Not found (kept with `verified: false` only if `keepUnverified: true`) |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `STORAGE_ADAPTER` | `mock` | `mock` or `zerog` |
| `OUTPUT_DIR` | `./output` | Mock storage output directory |
| `RAW_CAPTURE_PATH` | `./src/fixtures/sample-raw-capture.json` | Local raw capture file |
| `RAW_CAPTURE_DATA_ADDRESS` | — | 0G data address (overrides PATH) |
| `ZEROG_RPC_URL` | `https://evmrpc-testnet.0g.ai` | 0G EVM RPC endpoint |
| `ZEROG_INDEXER_URL` | `https://indexer-storage-testnet-turbo.0g.ai` | 0G storage indexer |
| `ZEROG_PRIVATE_KEY` | — | Signing key for 0G uploads |
| `ENABLE_LLM_REFINEMENT` | `false` | Enable LLM refinement step |
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

**Phase 1 – Deterministic rules (always runs):**
- Pattern: `"quote", Speaker verb`
- Pattern: `Speaker verb "quote"`
- Pattern: `According to Speaker, "quote"`
- All common attribution verbs: said, stated, declared, announced, warned, added, …
- Output: `statements.json` – every statement is an exact verbatim substring

**Phase 2 – LLM refinement (optional, `ENABLE_LLM_REFINEMENT=true`):**
- Receives clean JSON with paragraph IDs (NOT raw HTML)
- Processes in sliding windows (default 6 paragraphs per request)
- Schema-validated output: must match `LlmRawStatement[]` shape
- Every LLM result verified against source paragraphs before export
- Unverifiable statements discarded (not even `needs_review`)
- Results merged with Phase 1 (no duplicates); output: `verified_statements.json`
- Graceful fallback if endpoint unreachable

**Span verification (both phases):**
1. Exact substring match (`exact_match`)
2. Normalized match – strip invisible Unicode + collapse whitespace (`normalized_match`)
3. Discarded if neither succeeds

## 0G Storage adapter

The `ZeroGStorageAdapter` uses `@0gfoundation/0g-ts-sdk`:
- Upload: `MemData` (in-memory, no temp file) → `indexer.upload` → returns root hash as `dataAddress`
- Download: `indexer.download` to temp file → read → delete
- The Flow contract is auto-discovered from the indexer (no manual ABI patching needed)

The `dataAddress` in `document_manifest.json` is the 0G Merkle root hash for each artifact.

## Dev 3 interface

Dev 3 should:
1. Load `document_manifest.json` by its known 0G address.
2. Use `artifacts.retrievalChunks.dataAddress` to retrieve `retrieval_chunks.json`.
3. Use `artifacts.embeddings.dataAddress` to retrieve `embeddings.json`.
4. Import vectors into a vector database for semantic search.
5. Use `artifacts.statements.dataAddress` for evidence display and comparison.
