import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "./env";

const VERSION = "v1";

export function hasEncryptionKey() {
  return Boolean(getServerEnv().ENCRYPTION_KEY);
}

export function encryptSecret(value: string) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSecret(value: string) {
  const key = getKey();
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== VERSION || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted secret format");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function getKey() {
  const key = getServerEnv().ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY is required to store integration credentials");
  }

  return Buffer.from(key, "hex");
}
