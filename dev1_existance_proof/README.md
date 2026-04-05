# Dev 1 — Existence Proof Workflow (Standalone)

Direct HTTP-to-0G existence proof workflow for **Indelible**.

## Architecture

```
┌──────────┐      URL       ┌──────────────────┐      Fetch      ┌──────────┐
│  Server  │ ─────────────▷ │    Workflow      │ ─────────────▷ │ Public   │
│  (Host)  │                │    (Script)      │ ◁───────────── │ URL      │
└────┬─────┘                └────────┬─────────┘      Data      └──────────┘
     │                               │
     │                               ▼
     │                         ┌───────────┐
     │                         │ 0G Storage│
     └───────────────────────▷ │ (raw blob)│
                               └───────────┘
```

### Flow

1. **Host executes** the workflow script with a target URL.
2. Workflow **fetches raw content** from the URL (exact bytes, no normalization).
3. Workflow **computes `raw_hash`** using SHA-256 of the exact fetched content.
4. Workflow **computes `attestationId`** = SHA-256(url + timestamp + raw_hash).
5. Workflow **stores raw artifact** in 0G storage (→ receives `data_address`).
6. Workflow **returns a metadata record** (attestation) linking the URL to its 0G storage location.

### Trust Model

- **Trigger**: Direct execution (server-side logic).
- **Raw storage**: 0G (decentralized storage with Merkle tree verification).
- **Integrity**: Deterministic SHA-256 hashing for both content and attestation records.

## Project Structure

```
dev1_existance_proof/
├── workflow/
│   ├── index.ts                      # Standalone entry point
│   ├── handlers/
│   │   └── onSourceRequested.ts      # Main logic handler (fetch → hash → store)
│   ├── adapters/
│   │   ├── storage/
│   │   │   ├── StorageAdapter.ts     # Interface
│   │   │   ├── Mock0GStorageAdapter.ts  # In-memory mock
│   │   │   └── Sdk0GStorageAdapter.ts  # Real 0G SDK implementation
│   │   └── http/
│   │       └── fetchRawContent.ts    # Raw HTTP fetch utility
│   ├── types/
│   │   ├── RawArtifact.ts            # 0G storage schema
│   │   ├── OnchainAttestation.ts     # Attestation metadata schema
│   │   └── index.ts                  # Barrel export
│   └── utils/
│       ├── hashing.ts                # SHA-256 raw content hash
│       ├── ids.ts                    # attestationId generation
│       ├── serialization.ts          # Deterministic JSON serialization
│       └── mime.ts                   # Content-type extraction
├── tests/                           # Unit tests (Vitest)
│   ├── hashing.test.ts
│   ├── ids.test.ts
│   ├── serialization.test.ts
│   └── storage-adapter.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## 0G Storage Integration

The workflow supports both a mock environment and the real 0G Galileo testnet.

### Interface

```typescript
interface StorageAdapter {
  putRawArtifact(rawArtifact: RawArtifact): Promise<string>;
  getRawArtifact(dataAddress: string): Promise<RawArtifact>;
}
```

### Mock (local simulation)

`Mock0GStorageAdapter` — in-memory Map, deterministic `0g://mock/<hash>` addresses.

### Real (production)

`Sdk0GStorageAdapter` — uses `@0gfoundation/0g-ts-sdk` to upload to 0G. Returns `0g://<merkleRootHash>` addresses. Requires environment variables:

- `ZG_PRIVATE_KEY` — signer private key
- `ZG_RPC_URL` — e.g., `https://evmrpc-testnet.0g.ai`
- `ZG_INDEXER_URL` — e.g., `https://indexer-storage-testnet-turbo.0g.ai`

### Raw Artifact Format (stored in 0G)

```json
{
  "attestationId": "...",
  "requestId": "direct-request",
  "url": "https://example.com/page",
  "observed_at": "2026-04-05T12:00:00.000Z",
  "content_type": "text/html",
  "raw_hash": "...",
  "data_brut": "<html>...</html>"
}
```

## ID Strategy

| ID | Formula | Purpose |
|---|---|---|
| `raw_hash` | `sha256(rawContent)` | Integrity proof of the exact bytes fetched |
| `attestationId` | `sha256(url + observedAt + rawHash)` | Deterministic unique ID for the capture |

## Usage

### Installation

```bash
npm install
```

### Running the Workflow

To process a URL and store it (defaults to Mock storage unless configured):

```bash
npx tsx workflow/index.ts https://example.com
```

### Fetch HTTP (403/401, Reuters, etc.)

Le fetch utilise des **en-têtes de navigateur** (Chrome, `Sec-Fetch-*`, `sec-ch-ua`, `Referer` = origine du site) et ne télécharge **que le document HTML** (une requête GET — pas d’assets).

Si la cible renvoie encore **401/403** (bot detection, Akamai, etc.) :

| Variable | Rôle |
|----------|------|
| `FETCH_HTTP_PROXY` ou `HTTPS_PROXY` | Proxy HTTP(S) (ex. `http://127.0.0.1:8888` pour mitmproxy, ou proxy résidentiel). |
| `FETCH_COOKIE` | Cookie d’une session navigateur valide (copier depuis les DevTools → l’onglet réseau → en-tête `Cookie`). |
| `FETCH_REFERER` | Surcharge du `Referer` (défaut = `origin/` de l’URL). |
| `FETCH_SEC_FETCH_SITE` | `none` (défaut), `same-origin`, `same-site`, `cross-site` — certains WAF sont sensibles à cette valeur. |
| `FETCH_USER_AGENT` | Surcharge du User-Agent. |
| `FETCH_EXTRA_HEADERS` | JSON d’en-têtes supplémentaires, ex. `{"Cookie":"..."}`. |

Exemple avec proxy local :

```bash
set FETCH_HTTP_PROXY=http://127.0.0.1:8080
npx tsx workflow/index.ts "https://www.reuters.com/..."
```

### Running Tests

```bash
npm test          # Run Vitest suite
npm run typecheck # Verify TypeScript types
```

## Dependencies

| Package | Purpose |
|---|---|
| `@0gfoundation/0g-ts-sdk` | 0G storage uploads |
| `undici` | `fetch` + `ProxyAgent` (en-têtes « navigateur », proxy optionnel) |
| `dotenv` | Environment variable management |
| `vitest` | Unit testing |
| `tsx` | Direct TypeScript execution |
| `typescript` | Type safety |
