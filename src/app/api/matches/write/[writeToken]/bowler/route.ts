import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import { changeBowler } from "@/lib/match-service";

/**
 * Change the bowler for the current over, reassigning all deliveries bowled so far
 * in this over to the new bowler.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    const body = (await req.json()) as { bowlerId: string };
    
    if (!body.bowlerId) {
      return bad("bowlerId is required", 400);
    }

    const result = await changeBowler(
      decodeURIComponent(writeToken),
      body.bowlerId,
      cookie,
    );
    return ok({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
