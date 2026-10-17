import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import {
  parseDraftOps,
  parseExpectedDeliveryIds,
  StaleMatchEditError,
} from "@/lib/edit-draft";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import { applyMatchEditDraft } from "@/lib/match-service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const token = decodeURIComponent(writeToken);
    const body = (await req.json()) as Record<string, unknown>;
    const expectedUpdatedAt = String(body.expectedUpdatedAt ?? "");
    if (!expectedUpdatedAt) {
      return bad("expectedUpdatedAt is required", 400);
    }

    const payload = {
      expectedUpdatedAt,
      expectedDeliveryIdsByInningsId: parseExpectedDeliveryIds(
        body.expectedDeliveryIdsByInningsId,
      ),
      operations: parseDraftOps(body.operations),
    };

    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    const result = await applyMatchEditDraft(token, payload, cookie);
    return ok(result);
  } catch (e) {
    if (e instanceof StaleMatchEditError) {
      return bad(e.message, 409);
    }
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg.includes("PIN required") ? 403 : 400;
    return bad(msg, status);
  }
}
