import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/config/env";

export type EncryptedSecret = {
  cipher: string; // base64 ciphertext
  iv: string; // base64 12-byte nonce
  tag: string; // base64 16-byte GCM auth tag
};

function key(): Buffer {
  return Buffer.from(serverEnv.CONNECTION_ENCRYPTION_KEY, "base64");
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return {
    cipher: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(e: EncryptedSecret): string {
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(e.iv, "base64"));
  d.setAuthTag(Buffer.from(e.tag, "base64"));
  const dec = Buffer.concat([d.update(Buffer.from(e.cipher, "base64")), d.final()]);
  return dec.toString("utf8");
}
