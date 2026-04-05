import { describe, it, expect } from "vitest";
import { computeAttestationId } from "../workflow/utils/ids";

describe("computeAttestationId", () => {
  const url = "https://lemonde.fr/article405";
  const observedAt = 1775304000n;
  const rawHash = "abc123def456789012345678901234567890123456789012345678901234abcd";

  it("produces a deterministic ID", () => {
    const id1 = computeAttestationId(url, observedAt, rawHash);
    const id2 = computeAttestationId(url, observedAt, rawHash);
    expect(id1).toBe(id2);
  });

  it("returns a hex string", () => {
    const id = computeAttestationId(url, observedAt, rawHash);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
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
    const otherHash = "1111111111111111111111111111111111111111111111111111111111111111";
    const id1 = computeAttestationId(url, observedAt, rawHash);
    const id2 = computeAttestationId(url, observedAt, otherHash);
    expect(id1).not.toBe(id2);
  });
});

