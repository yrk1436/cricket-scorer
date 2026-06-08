import { createHmac, timingSafeEqual } from "crypto";
import { getUnlockSecret } from "@/lib/env";

type Payload = {
  mid: string;
  exp: number;
  sig: string;
};

export function peekUnlockSecret(): string | undefined {
  return process.env.MATCH_UNLOCK_SECRET;
}

function signPayload(secret: string, matchId: string, expMs: number): string {
  const payload = `${matchId}:${expMs}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Issue token (needs MATCH_UNLOCK_SECRET in env). */
export function createUnlockToken(matchId: string, ttlMs = 2 * 60 * 60 * 1000) {
  const secret = getUnlockSecret();
  const exp = Date.now() + ttlMs;
  const sig = signPayload(secret, matchId, exp);
  const raw: Omit<Payload, "sig"> & { sig: string } = { mid: matchId, exp, sig };
  return Buffer.from(JSON.stringify(raw), "utf8").toString("base64url");
}

export function parseUnlockToken(cookieVal: string | undefined): Payload | null {
  if (!cookieVal) return null;
  const secret = peekUnlockSecret();
  if (!secret) return null;
  try {
    const decoded = Buffer.from(cookieVal, "base64url").toString("utf8");
    const obj = JSON.parse(decoded) as Payload;
    if (!obj.mid || typeof obj.exp !== "number" || !obj.sig) return null;
    const expect = signPayload(secret, obj.mid, obj.exp);
    const a = Buffer.from(expect, "hex");
    const b = Buffer.from(obj.sig, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

export function isEditUnlockedForMatch(
  cookieVal: string | undefined,
  matchId: string,
) {
  const p = parseUnlockToken(cookieVal);
  return p?.mid === matchId;
}

export const EDIT_COOKIE_NAME = "cric_match_unlock";
