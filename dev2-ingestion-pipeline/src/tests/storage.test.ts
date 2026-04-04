/**
 * Tests for the Mock Storage adapter.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { MockStorageAdapter } from "../adapters/storage/MockStorageAdapter.js";

function tempDir(): string {
  return join(tmpdir(), `indelible_test_${randomBytes(4).toString("hex")}`);
}

describe("MockStorageAdapter", () => {
  let adapter: MockStorageAdapter;

  beforeEach(() => {
    adapter = new MockStorageAdapter(tempDir());
  });

  it("uploadArtifact returns a non-empty dataAddress", async () => {
    const addr = await adapter.uploadArtifact("test.json", '{"hello":"world"}');
    expect(addr).toBeTruthy();
    expect(addr.length).toBeGreaterThan(0);
  });

  it("downloadArtifact retrieves the same content", async () => {
    const content = JSON.stringify({ foo: "bar", n: 42 });
    const addr = await adapter.uploadArtifact("artifact.json", content);
    const retrieved = await adapter.downloadArtifact(addr);
    expect(retrieved).toBe(content);
  });

  it("different content produces different dataAddresses", async () => {
    const addr1 = await adapter.uploadArtifact("a.json", '{"a":1}');
    const addr2 = await adapter.uploadArtifact("b.json", '{"b":2}');
    expect(addr1).not.toBe(addr2);
  });

  it("same content always produces the same dataAddress", async () => {
    const adapter1 = new MockStorageAdapter(tempDir());
    const adapter2 = new MockStorageAdapter(tempDir());
    const content = '{"stable":true}';
    const addr1 = await adapter1.uploadArtifact("file.json", content);
    const addr2 = await adapter2.uploadArtifact("file.json", content);
    // The hash portion should match even across adapter instances
    expect(addr1).toBe(addr2);
  });

  it("throws when downloading unknown address", async () => {
    await expect(
      adapter.downloadArtifact("mock://sha256:0000000000000000000000000000000000000000000000000000000000000000/unknown.json")
    ).rejects.toThrow();
  });
});
