# Indelible RAG Pipeline

Citation-first RAG pipeline that reads chunks from 0G Storage.

## Structure

```
schemas/           # Agent output schema
src/
  storage/         # 0G adapter (interface + mock)
  retrieval/       # Embedding + search
  agent/           # Prompt template + guardrails + main agent
fixtures/          # Sample manifests and chunks
tests/             # Unit tests
```

## Usage

```typescript
import { query, configureAgent } from "./src/agent/agent";

// Basic query
const result = await query("What did Trump say about tariffs?", "doc-001");

// Access results
console.log(result.output.answer);
console.log(result.output.citations); // Each citation has 0G storagePointer
console.log(result.output.confidence);
console.log(result.retrievalPassed);
```

## Agent Output Schema

```json
{
  "answer": "string",
  "citations": [
    {
      "chunkId": "doc-001-chunk-0003",
      "quote": "short exact quote",
      "sourceUrl": "https://...",
      "observedAt": "2026-04-04T08:45:00Z",
      "storagePointer": "0g://chunks/doc-001/chunk-0003.json"
    }
  ],
  "confidence": 0.0-1.0,
  "evidence": ["doc-001-chunk-0003"],
  "limitations": "string"
}
```

## Key Guardrails

1. **No answer without evidence**: If no chunks retrieved or avg score < 0.1, returns `insufficient evidence`
2. **Citation enforcement**: Every factual claim must cite a chunkId with valid 0G pointer
3. **Contradiction detection**: Surfaces when chunks disagree
4. **Retry on missing citations**: Re-prompts once if LLM fails to cite

## Connecting to Real 0G

Replace `MockStorageAdapter` with a real implementation:

```typescript
import { setStorageAdapter } from "./src/storage/0g-adapter";
import { RealStorageAdapter } from "./src/storage/0g-adapter";

setStorageAdapter(new RealStorageAdapter(0gProvider));
```

## Running Tests

```bash
npx jest tests/rag-pipeline.test.ts
```
