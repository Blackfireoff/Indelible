import { describe, it, expect } from "vitest";
import { encodeFunctionData, decodeFunctionData, parseAbi } from "viem";

/**
 * Tests for encoding the recordAttestation calldata
 * that the CRE workflow submits to SourceAttestationRegistry.
 */

const attestationRegistryAbi = parseAbi([
  "function recordAttestation(bytes32 attestationId, bytes32 requestId, string url, bytes32 rawHash, string dataAddress, uint64 observedAt, string contentType)",
]);

describe("recordAttestation calldata encoding", () => {
  const testAttestation = {
    attestationId: "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`,
    requestId: "0x2222222222222222222222222222222222222222222222222222222222222222" as `0x${string}`,
    url: "https://lemonde.fr/article405",
    rawHash: "0x3333333333333333333333333333333333333333333333333333333333333333" as `0x${string}`,
    dataAddress: "0g://mock/0xabcdef",
    observedAt: 1775304000n,
    contentType: "text/html",
  };

  it("encodes without error", () => {
    const calldata = encodeFunctionData({
      abi: attestationRegistryAbi,
      functionName: "recordAttestation",
      args: [
        testAttestation.attestationId,
        testAttestation.requestId,
        testAttestation.url,
        testAttestation.rawHash,
        testAttestation.dataAddress,
        testAttestation.observedAt,
        testAttestation.contentType,
      ],
    });

    expect(calldata).toMatch(/^0x/);
    // Function selector is 4 bytes = 8 hex chars + 0x prefix
    expect(calldata.length).toBeGreaterThan(10);
  });

  it("round-trips: encode → decode preserves all fields", () => {
    const calldata = encodeFunctionData({
      abi: attestationRegistryAbi,
      functionName: "recordAttestation",
      args: [
        testAttestation.attestationId,
        testAttestation.requestId,
        testAttestation.url,
        testAttestation.rawHash,
        testAttestation.dataAddress,
        testAttestation.observedAt,
        testAttestation.contentType,
      ],
    });

    const decoded = decodeFunctionData({
      abi: attestationRegistryAbi,
      data: calldata,
    });

    expect(decoded.functionName).toBe("recordAttestation");

    const args = decoded.args as [
      `0x${string}`, `0x${string}`, string, `0x${string}`, string, bigint, string
    ];

    expect(args[0]).toBe(testAttestation.attestationId);
    expect(args[1]).toBe(testAttestation.requestId);
    expect(args[2]).toBe(testAttestation.url);
    expect(args[3]).toBe(testAttestation.rawHash);
    expect(args[4]).toBe(testAttestation.dataAddress);
    expect(args[5]).toBe(testAttestation.observedAt);
    expect(args[6]).toBe(testAttestation.contentType);
  });

  it("produces consistent calldata for the same inputs", () => {
    const calldata1 = encodeFunctionData({
      abi: attestationRegistryAbi,
      functionName: "recordAttestation",
      args: [
        testAttestation.attestationId,
        testAttestation.requestId,
        testAttestation.url,
        testAttestation.rawHash,
        testAttestation.dataAddress,
        testAttestation.observedAt,
        testAttestation.contentType,
      ],
    });

    const calldata2 = encodeFunctionData({
      abi: attestationRegistryAbi,
      functionName: "recordAttestation",
      args: [
        testAttestation.attestationId,
        testAttestation.requestId,
        testAttestation.url,
        testAttestation.rawHash,
        testAttestation.dataAddress,
        testAttestation.observedAt,
        testAttestation.contentType,
      ],
    });

    expect(calldata1).toBe(calldata2);
  });
});
