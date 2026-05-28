import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto/tokens";

describe("token encryption (AES-256-GCM)", () => {
  it("round-trips a secret", () => {
    const plain = "ya29.a0AfH6SMexample-access-token";
    const enc = encryptSecret(plain);
    expect(enc.cipher).not.toContain(plain);
    expect(enc.iv).toBeTruthy();
    expect(enc.tag).toBeTruthy();
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a.cipher).not.toBe(b.cipher);
    expect(a.iv).not.toBe(b.iv);
  });

  it("rejects a tampered ciphertext (auth tag mismatch)", () => {
    const enc = encryptSecret("sensitive");
    const tampered = { ...enc, cipher: Buffer.from("00".repeat(8), "hex").toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
