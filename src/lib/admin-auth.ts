import { createHmac, timingSafeEqual } from "crypto";
import { getAdminSecret } from "@/lib/env";

type AdminPayload = {
  scope: "admin";
  exp: number;
  sig: string;
};

export const ADMIN_COOKIE_NAME = "cric_admin_session";

function signAdmin(secret: string, expMs: number): string {
  return createHmac("sha256", secret).update(`admin:${expMs}`).digest("hex");
}

export function createAdminSessionToken(ttlMs = 8 * 60 * 60 * 1000) {
  const secret = getAdminSecret();
  const exp = Date.now() + ttlMs;
  const sig = signAdmin(secret, exp);
  return Buffer.from(JSON.stringify({ scope: "admin", exp, sig }), "utf8").toString(
    "base64url",
  );
}

export function parseAdminSession(cookieVal: string | undefined): boolean {
  if (!cookieVal) return false;
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  try {
    const obj = JSON.parse(
      Buffer.from(cookieVal, "base64url").toString("utf8"),
    ) as AdminPayload;
    if (obj.scope !== "admin" || typeof obj.exp !== "number" || !obj.sig) {
      return false;
    }
    const expect = signAdmin(secret, obj.exp);
    const a = Buffer.from(expect, "hex");
    const b = Buffer.from(obj.sig, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    return Date.now() <= obj.exp;
  } catch {
    return false;
  }
}

export function verifyAdminKey(key: string): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !key) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(key, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
