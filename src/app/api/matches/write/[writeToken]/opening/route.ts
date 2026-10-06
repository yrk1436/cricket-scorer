import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import { setOpeningLineup, clearOpeningBowler, setOpeningBowler } from "@/lib/match-service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    const body = await req.json();
    const strikerId = String(body.strikerId ?? "");
    const nonStrikerId = String(body.nonStrikerId ?? "");
    const bowlerId = String(body.bowlerId ?? "");
    await setOpeningLineup(
      decodeURIComponent(writeToken),
      { strikerId, nonStrikerId, bowlerId },
      cookie,
    );
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}

/** Clear the opening bowler (for undo before first ball). */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    await clearOpeningBowler(decodeURIComponent(writeToken), cookie);
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}

/** Update just the opening bowler (change bowler before first ball). */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    const body = await req.json();
    const bowlerId = String(body.bowlerId ?? "");
    if (!bowlerId) {
      return bad("bowlerId is required", 400);
    }
    await setOpeningBowler(decodeURIComponent(writeToken), bowlerId, cookie);
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
