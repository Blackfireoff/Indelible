import { describe, it, expect } from "vitest";
import { decodeEventLog, encodeEventTopics, encodeAbiParameters, parseAbi, keccak256, toHex, toBytes } from "viem";

/**
 * Tests for decoding SourceAttestationRequested event logs.
 * This verifies the same decoding logic used in the CRE workflow handler.
 */

const requestEventAbi = parseAbi([
  "event SourceAttestationRequested(bytes32 indexed requestId, address indexed requester, string url, uint64 requestedAt)",
]);

describe("SourceAttestationRequested event decoding", () => {
  const testRequestId = "0xabc123def456789012345678901234567890123456789012345678901234abcd" as `0x${string}`;
  const testRequester = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;
  const testUrl = "https://lemonde.fr/article405";
  const testRequestedAt = 1775304000n;

  function encodeTestLog() {
    // Encode topics (event signature + indexed params)
    const topics = encodeEventTopics({
      abi: requestEventAbi,
      eventName: "SourceAttestationRequested",
      args: {
        requestId: testRequestId,
        requester: testRequester,
      },
    }) as [`0x${string}`, ...`0x${string}`[]];

    // Encode non-indexed data (url, requestedAt)
    const data = encodeAbiParameters(
      [
        { name: "url", type: "string" },
        { name: "requestedAt", type: "uint64" },
      ],
      [testUrl, testRequestedAt]
    );

    return { topics, data };
  }

  it("decodes all fields correctly", () => {
    const { topics, data } = encodeTestLog();

    const decoded = decodeEventLog({
      abi: requestEventAbi,
      data,
      topics,
    });

    expect(decoded.eventName).toBe("SourceAttestationRequested");

    const args = decoded.args as {
      requestId: `0x${string}`;
      requester: `0x${string}`;
      url: string;
      requestedAt: bigint;
    };

    expect(args.requestId).toBe(testRequestId);
    expect(args.requester.toLowerCase()).toBe(testRequester.toLowerCase());
    expect(args.url).toBe(testUrl);
    expect(args.requestedAt).toBe(testRequestedAt);
  });

  it("produces the correct event signature topic", () => {
    const expectedSig = keccak256(
      toBytes("SourceAttestationRequested(bytes32,address,string,uint64)")
    );

    const { topics } = encodeTestLog();
    expect(topics[0]).toBe(expectedSig);
  });

  it("requestId is in topic[1]", () => {
    const { topics } = encodeTestLog();
    expect(topics[1]).toBe(testRequestId);
  });

  it("requester is in topic[2] (zero-padded address)", () => {
    const { topics } = encodeTestLog();
    // Address is left-padded to 32 bytes in topic
    expect(topics[2]?.toLowerCase()).toContain(testRequester.slice(2).toLowerCase());
  });
});
