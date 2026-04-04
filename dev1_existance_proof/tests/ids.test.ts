import { describe, it, expect } from "vitest";
import { computeRequestId, computeAttestationId } from "../workflow/utils/ids";

describe("computeRequestId", () => {
  const requester = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;
  const url = "https://lemonde.fr/article405";
  const requestedAt = 1775304000n;

  it("produces a deterministic ID", () => {
    const id1 = computeRequestId(requester, url, requestedAt);
    const id2 = computeRequestId(requester, url, requestedAt);
    expect(id1).toBe(id2);
  });

  it("returns a 0x-prefixed bytes32 hex string", () => {
    const id = computeRequestId(requester, url, requestedAt);
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes when requester changes", () => {
    const other = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`;
    const id1 = computeRequestId(requester, url, requestedAt);
    const id2 = computeRequestId(other, url, requestedAt);
    expect(id1).not.toBe(id2);
  });

  it("changes when url changes", () => {
    const id1 = computeRequestId(requester, url, requestedAt);
    const id2 = computeRequestId(requester, "https://other.com/page", requestedAt);
    expect(id1).not.toBe(id2);
  });

  it("changes when requestedAt changes", () => {
    const id1 = computeRequestId(requester, url, requestedAt);
    const id2 = computeRequestId(requester, url, requestedAt + 1n);
    expect(id1).not.toBe(id2);
  });
});

describe("computeAttestationId", () => {
  const url = "https://lemonde.fr/article405";
  const observedAt = 1775304000n;
  const rawHash = "0xabc123def456789012345678901234567890123456789012345678901234abcd" as `0x${string}`;

  it("produces a deterministic ID", () => {
    const id1 = computeAttestationId(url, observedAt, rawHash);
    const id2 = computeAttestationId(url, observedAt, rawHash);
    expect(id1).toBe(id2);
  });

  it("returns a 0x-prefixed bytes32 hex string", () => {
    const id = computeAttestationId(url, observedAt, rawHash);
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes when url changes", () => {
    const id1 = computeAttestationId(url, observedAt, rawHash);
    const id2 = computeAttestationId("https://other.com", observedAt, rawHash);
    expect(id1).not.toBe(id2);
  });

  it("changes when observedAt changes", () => {
    const id1 = computeAttestationId(url, observedAt, rawHash);
    const id2 = computeAttestationId(url, observedAt + 1n, rawHash);
    expect(id1).not.toBe(id2);
  });

  it("changes when rawHash changes", () => {
    const otherHash = "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`;
    const id1 = computeAttestationId(url, observedAt, rawHash);
    const id2 = computeAttestationId(url, observedAt, otherHash);
    expect(id1).not.toBe(id2);
  });
});
