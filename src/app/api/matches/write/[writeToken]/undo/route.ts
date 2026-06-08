import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import { undoLastDelivery } from "@/lib/match-service";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    await undoLastDelivery(decodeURIComponent(writeToken), cookie);
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
