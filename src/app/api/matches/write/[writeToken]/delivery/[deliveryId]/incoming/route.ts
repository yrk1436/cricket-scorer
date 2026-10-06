import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import { setIncomingBatter } from "@/lib/match-service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ writeToken: string; deliveryId: string }> },
) {
  try {
    const { writeToken, deliveryId } = await ctx.params;
    const token = decodeURIComponent(writeToken);
    const body = (await req.json()) as { incomingStrikerId: string };
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;

    if (!body.incomingStrikerId) {
      return bad("Incoming batter is required", 400);
    }

    await setIncomingBatter(token, deliveryId, body.incomingStrikerId, cookie);
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
