import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "../env";

// Signed, tamper-proof OAuth `state` param. Encodes the LC id and the user id
// so the callback can attribute the connection without a server-side session
// store, and an HMAC prevents forgery/CSRF.
type StatePayload = { lcId: string; userId: string; nonce: string; ts: number };

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function key() {
  const k = getServerEnv().ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY is required for OAuth state signing");
  return Buffer.from(k, "hex");
}

export function signState(lcId: string, userId: string): string {
  const payload: StatePayload = { lcId, userId, nonce: randomNonce(), ts: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): StatePayload | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (Date.now() - payload.ts > MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

function randomNonce() {
  // Avoid importing randomBytes twice; HMAC key material already seeded crypto.
  return createHmac("sha256", key()).update(String(process.hrtime.bigint())).digest("base64url").slice(0, 16);
}
