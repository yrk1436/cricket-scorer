import { NextResponse } from "next/server";
import { bad } from "@/lib/api-json";
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  verifyAdminKey,
} from "@/lib/admin-auth";

export async function POST(req: Request) {
  try {
    if (!process.env.ADMIN_SECRET) {
      return bad("Admin not configured", 503);
    }
    const { key } = (await req.json()) as { key?: string };
    if (!key || !verifyAdminKey(key)) {
      return bad("Invalid admin key", 401);
    }
    const token = createAdminSessionToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 500);
  }
}
