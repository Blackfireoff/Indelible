# Indelible – Dev 2: HTML Ingestion Pipeline

Transforms a raw HTML capture produced by Dev 1 into a structured, searchable, evidence-preserving corpus stored in 0G Storage.

## What it produces

| Artifact | Purpose |
|---|---|
| `clean_article.json` | Cleaned article text, ordered paragraphs, provenance |
| `statements.json` | Exact political statements with speaker attribution |
| `retrieval_chunks.json` | Statement + paragraph chunks for semantic retrieval |
| `embeddings.json` | Embedding vectors for all chunks (OpenAI or stub) |
| `document_manifest.json` | Entry point linking all artifacts via 0G data addresses |

## Architecture

```
raw HTML (Dev 1)
    │
    ▼
extractMainArticle       ← Mozilla Readability + jsdom + fallback DOM walk
    │
    ▼
buildCleanArticle        ← ordered paragraphs, offsets, provenance
    │
    ▼
extractStatements        ← Phase 1: regex rules  →  Phase 2: constrained LLM
    │
    ▼
validateStatements       ← exact substring verification (non-negotiable)
    │
    ▼
buildRetrievalChunks     ← statement chunks + paragraph chunks
    │
    ▼
generateEmbeddings       ← OpenAI text-embedding-3-small (or zero-vector stub)
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

```bash
RAW_CAPTURE_PATH=./src/fixtures/sample-raw-capture.json npm run pipeline
```

Output artifacts are written to `./output/`.

### 4. Run tests

```bash
npm test
```

All 56 tests run without any API keys (embeddings use a zero-vector stub).

### 5. Run with 0G Storage

```bash
STORAGE_ADAPTER=zerog \
ZEROG_PRIVATE_KEY=0xYOUR_KEY \
RAW_CAPTURE_PATH=./src/fixtures/sample-raw-capture.json \
npm run pipeline
```

### 6. Load raw capture from 0G

```bash
STORAGE_ADAPTER=zerog \
ZEROG_PRIVATE_KEY=0xYOUR_KEY \
RAW_CAPTURE_DATA_ADDRESS=0xABC123... \
npm run pipeline
```

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
| `OPENAI_API_KEY` | — | Enables real embeddings + LLM fallback |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | LLM fallback model |

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

**Phase 1 – Rules (primary):**
- Pattern: `"quote", Speaker verb`
- Pattern: `Speaker verb "quote"`
- Pattern: `According to Speaker, "quote"`
- All common attribution verbs: said, stated, declared, announced, warned, added, …

**Phase 2 – LLM fallback (only when `OPENAI_API_KEY` is set and Phase 1 yields no results):**
- Constrained system prompt: exact verbatim only, JSON output, no paraphrasing
- Every LLM result is validated against the source paragraph before acceptance
- LLM results are marked `needs_review` regardless of content match

## 0G Storage adapter

The `ZeroGStorageAdapter` uses `@0glabs/0g-ts-sdk`:
- Upload: `ZgFile.fromFilePath` → `indexer.upload` → returns root hash as `dataAddress`
- Download: `indexer.download` to temp file → read → delete

The `dataAddress` in `document_manifest.json` is the 0G Merkle root hash for each artifact.

## Dev 3 interface

Dev 3 should:
1. Load `document_manifest.json` by its known 0G address.
2. Use `artifacts.retrievalChunks.dataAddress` to retrieve `retrieval_chunks.json`.
3. Use `artifacts.embeddings.dataAddress` to retrieve `embeddings.json`.
4. Import vectors into a vector database for semantic search.
5. Use `artifacts.statements.dataAddress` for evidence display and comparison.
