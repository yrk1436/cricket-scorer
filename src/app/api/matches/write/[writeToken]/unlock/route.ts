import { NextResponse } from "next/server";
import { bad } from "@/lib/api-json";
import {
  EDIT_COOKIE_NAME,
  createUnlockToken,
} from "@/lib/edit-unlock";
import { getMatchByWriteToken, verifyPin } from "@/lib/match-service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const m = await getMatchByWriteToken(decodeURIComponent(writeToken));
    if (!m) return bad("Not found", 404);
    if (m.status !== "completed") return bad("Match is still live — no PIN needed");

    const { pin } = (await req.json()) as { pin?: string };
    if (!pin) return bad("PIN required");

    const okPin = await verifyPin(pin, m.pin_hash);
    if (!okPin) return bad("Wrong PIN", 401);

    const token = createUnlockToken(m.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(EDIT_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 2 * 60 * 60,
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 500);
  }
}
