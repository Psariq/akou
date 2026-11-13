import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

describe("passphrase lock", () => {
  it("round-trips with the right passphrase and fails with a wrong one", async () => {
    const blob = await encryptSecret("sk-ant-test-123", "correct horse battery");
    expect(blob.data).not.toContain("sk-ant");
    expect(await decryptSecret(blob, "correct horse battery")).toBe("sk-ant-test-123");
    await expect(decryptSecret(blob, "wrong")).rejects.toThrow();
  }, 20000);
});
