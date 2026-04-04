import { describe, it, expect } from "vitest";
import { computeRawHash } from "../workflow/utils/hashing";

describe("computeRawHash", () => {
  it("produces a deterministic hash for the same input", () => {
    const content = "<html><body>Hello World</body></html>";
    const hash1 = computeRawHash(content);
    const hash2 = computeRawHash(content);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = computeRawHash("<html>A</html>");
    const hash2 = computeRawHash("<html>B</html>");
    expect(hash1).not.toBe(hash2);
  });

  it("returns a 0x-prefixed hex string of 66 characters (bytes32)", () => {
    const hash = computeRawHash("test content");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("does NOT normalize whitespace — different whitespace produces different hashes", () => {
    const hash1 = computeRawHash("<p>  hello  </p>");
    const hash2 = computeRawHash("<p> hello </p>");
    expect(hash1).not.toBe(hash2);
  });

  it("preserves exact byte order — trailing newline matters", () => {
    const hash1 = computeRawHash("content");
    const hash2 = computeRawHash("content\n");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", () => {
    const hash = computeRawHash("");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("handles unicode content", () => {
    const hash = computeRawHash("La transition énergétique n'est pas un choix");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
