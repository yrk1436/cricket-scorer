import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import { updateMatchSettings } from "@/lib/match-service";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const token = decodeURIComponent(writeToken);
    const body = (await req.json()) as Record<string, unknown>;
    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;

    await updateMatchSettings(
      token,
      {
        maxBallsPerOver:
          body.maxBallsPerOver !== undefined
            ? Number(body.maxBallsPerOver)
            : undefined,
        oversPerInnings:
          body.oversPerInnings !== undefined
            ? Number(body.oversPerInnings)
            : undefined,
        maxWickets:
          body.maxWickets !== undefined ? Number(body.maxWickets) : undefined,
      },
      cookie,
    );

    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
