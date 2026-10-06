import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import { undoLastDelivery, clearIncomingBatter } from "@/lib/match-service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    const token = decodeURIComponent(writeToken);

    let body: { mode?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body or invalid JSON - use default full undo
    }

    if (body.mode === "clear_incoming_batter") {
      const result = await clearIncomingBatter(token, cookie);
      return ok({ ok: true, ...result });
    }

    await undoLastDelivery(token, cookie);
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
