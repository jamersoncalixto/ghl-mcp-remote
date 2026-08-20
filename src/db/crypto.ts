import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const b64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "Missing required env var TOKEN_ENCRYPTION_KEY (32 bytes, base64 — generate with `openssl rand -base64 32`).",
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes, got ${key.length}.`);
  }
  return key;
}

/** AES-256-GCM encrypt. Output packs iv(12) + authTag(16) + ciphertext, base64-encoded. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** One-way hash used to store our own issued OAuth codes/tokens — never the plaintext value. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
