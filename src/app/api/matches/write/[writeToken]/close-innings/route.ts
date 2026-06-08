import { bad, ok } from "@/lib/api-json";
import { closeCurrentInnings } from "@/lib/match-service";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const result = await closeCurrentInnings(
      decodeURIComponent(writeToken),
    );
    return ok(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
