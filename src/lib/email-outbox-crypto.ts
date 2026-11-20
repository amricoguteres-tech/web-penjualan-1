import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { HttpError } from "@/lib/http";

const PREFIX = "v1";

export function getEmailOutboxEncryptionKey(value = process.env.EMAIL_OUTBOX_ENCRYPTION_KEY) {
  if (!value) {
    throw new HttpError(503, "Email outbox encryption is not configured", "EMAIL_OUTBOX_CONFIGURATION");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new HttpError(503, "Email outbox encryption key must be 32-byte base64", "EMAIL_OUTBOX_CONFIGURATION");
  }
  return key;
}

export function isEncryptedEmailOutboxBody(value: string) {
  return value.startsWith(`${PREFIX}:`);
}

export function encryptEmailOutboxBody(plaintext: string, keyValue?: string) {
  const key = getEmailOutboxEncryptionKey(keyValue);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${PREFIX}:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptEmailOutboxBody(payload: string, keyValue?: string) {
  if (!isEncryptedEmailOutboxBody(payload)) {
    throw new HttpError(500, "Email outbox payload is not encrypted", "EMAIL_OUTBOX_CIPHERTEXT_INVALID");
  }
  const [, ivText, tagText, ciphertextText, extra] = payload.split(":");
  if (!ivText || !tagText || !ciphertextText || extra !== undefined) {
    throw new HttpError(500, "Email outbox payload is invalid", "EMAIL_OUTBOX_CIPHERTEXT_INVALID");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", getEmailOutboxEncryptionKey(keyValue), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new HttpError(500, "Email outbox payload could not be decrypted", "EMAIL_OUTBOX_CIPHERTEXT_INVALID");
  }
}
