# Dev 1 — Existence Proof Workflow

On-chain triggered, CRE-orchestrated, 0G-stored existence proof for **Indelible**.

## Architecture

```
┌──────────┐    tx     ┌─────────────────────┐   event   ┌──────────────────┐
│   User   │ ────────▷ │ SourceRequestRegistry│ ────────▷ │  Chainlink CRE   │
│  (dApp)  │           │    (Smart Contract)  │           │    Workflow       │
└──────────┘           └─────────────────────┘           └────────┬─────────┘
                                                                  │
                                                    ┌─────────────┼──────────────┐
                                                    ▼             ▼              ▽
                                              ┌──────────┐ ┌───────────┐ ┌──────────────────────┐
                                              │ HTTP Fetch│ │ 0G Storage│ │SourceAttestationReg. │
                                              │ (raw URL) │ │ (raw blob)│ │   (onchain record)   │
                                              └──────────┘ └───────────┘ └──────────────────────┘
```

### Flow

1. **User calls** `SourceRequestRegistry.requestSourceAttestation(url)` on-chain
2. Contract emits `SourceAttestationRequested(requestId, requester, url, requestedAt)`
3. **CRE Workflow** listens via EVM log trigger (filtered by contract address + event signature)
4. Workflow **fetches raw content** from the URL (exact bytes, no normalization)
5. Workflow **computes `rawHash`** = keccak256 of the exact fetched content
6. Workflow **stores raw artifact** in 0G storage (→ receives `dataAddress`)
7. Workflow **writes attestation** to `SourceAttestationRegistry.recordAttestation(...)` on-chain
8. `SourceAttested` event is emitted confirming the proof

### Trust Model

- **Trigger**: On-chain (no centralized API endpoint)
- **Orchestration**: Chainlink CRE (decentralized oracle network)
- **Raw storage**: 0G (decentralized storage with Merkle tree verification)
- **Attestation**: On-chain (immutable, verifiable)

## Target Chain

**0G Galileo Testnet** — Chain ID `16602`

## Project Structure

```
dev1_existance_proof/
├── contracts/
│   ├── SourceRequestRegistry.sol     # User-facing request contract
│   └── SourceAttestationRegistry.sol # CRE-writable attestation registry
├── workflow/
│   ├── index.ts                      # CRE workflow entry point
│   ├── handlers/
│   │   └── onSourceRequested.ts      # Main event handler (decode → fetch → hash → store → attest)
│   ├── adapters/
│   │   ├── storage/
│   │   │   ├── StorageAdapter.ts     # Interface
│   │   │   ├── Mock0GStorageAdapter.ts  # In-memory mock
│   │   │   └── Real0GStorageAdapter.ts  # 0G Galileo stub
│   │   └── http/
│   │       └── fetchRawContent.ts    # Raw HTTP fetch
│   ├── types/
│   │   ├── SourceRequestEvent.ts
│   │   ├── RawArtifact.ts
│   │   ├── OnchainAttestation.ts
│   │   └── index.ts                  # Barrel export
│   └── utils/
│       ├── hashing.ts                # keccak256 raw content hash
│       ├── ids.ts                    # requestId / attestationId generation
│       ├── serialization.ts          # Deterministic JSON serialization
│       └── mime.ts                   # Content-type extraction
├── fixtures/
│   ├── sample-request.json
│   └── sample-raw-html.html
├── tests/
│   ├── hashing.test.ts
│   ├── ids.test.ts
│   ├── serialization.test.ts
│   ├── event-decoding.test.ts
│   ├── contract-encoding.test.ts
│   └── storage-adapter.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## EVM Log Trigger

The CRE workflow uses an **EVM log trigger** from `@chainlink/cre-sdk`:

```typescript
evmClient.logTrigger({
  addresses: [hexToBase64(config.contractAddress)],
  topics: [{ values: [hexToBase64(SOURCE_ATTESTATION_REQUESTED_SIG)] }],
  confidence: "CONFIDENCE_LEVEL_FINALIZED",
})
```

- **`addresses`**: The deployed `SourceRequestRegistry` contract address (base64-encoded)
- **`topics[0]`**: The keccak256 event signature of `SourceAttestationRequested(bytes32,address,string,uint64)`
- **`confidence`**: Waits for finality to avoid chain reorgs

## 0G Storage Integration

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

`Sdk0GStorageAdapter` — uses `@0gfoundation/0g-ts-sdk` to upload to 0G Galileo testnet. Returns `0g://<merkleRootHash>` addresses. Requires:

- `ZG_PRIVATE_KEY` — signer private key
- `ZG_RPC_URL` — default: `https://evmrpc-testnet.0g.ai`
- `ZG_INDEXER_URL` — default: `https://indexer-storage-testnet-turbo.0g.ai`

### Raw Artifact Format (stored in 0G)

```json
{
  "attestationId": "0x...",
  "requestId": "0x...",
  "url": "https://lemonde.fr/article405",
  "observed_at": "2026-04-04T12:00:00.000Z",
  "content_type": "text/html",
  "raw_hash": "0x...",
  "data_brut": "<html>...</html>"
}
```

## ID Strategy

| ID | Formula | Purpose |
|---|---|---|
| `requestId` | `keccak256(abi.encodePacked(requester, url, requestedAt))` | Identifies the user's request |
| `attestationId` | `keccak256(abi.encodePacked(url, observedAt, rawHash))` | Identifies the final attestation |

Both are computed identically on-chain (Solidity) and off-chain (TypeScript with viem).

## Local Simulation

```bash
cd dev1_existance_proof
npm install
npm test          # Run all 37 tests
npm run typecheck # Verify TypeScript types
```

The mock adapter allows running the entire workflow without 0G credentials or a real blockchain.

## How Dev 2 Should Consume the Raw Artifact

Dev 2 (ingestion, canonicalization, chunking, embeddings) should:

1. **Retrieve the raw artifact** from 0G using the `dataAddress` from the on-chain attestation
2. **Parse `data_brut`** — the exact raw HTML/text as fetched
3. **Use `content_type`** to determine the parser (HTML, text, PDF, etc.)
4. **Use `raw_hash`** to verify integrity before processing
5. **Use `attestationId`** and `requestId` to link back to the on-chain records

The `StorageAdapter` interface is the API boundary — Dev 2 can use either the mock or real adapter.

## Access Control

The `SourceAttestationRegistry` has an `onlyOracle` modifier:
- Only the designated `oracleWriter` address can call `recordAttestation()`
- The contract owner can update the oracle writer via `setOracleWriter()`
- This prevents unauthorized attestation writes

## Dependencies

| Package | Purpose |
|---|---|
| `@chainlink/cre-sdk` | CRE workflow SDK (triggers, runtime, runner) |
| `viem` | ABI encoding/decoding, keccak256, event parsing |
| `@0gfoundation/0g-ts-sdk` | 0G storage uploads (optional, for real adapter) |
| `ethers` | 0G signer setup (optional, for real adapter) |
| `vitest` | Test runner |
| `typescript` | Type checking |
