import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import { updateDelivery } from "@/lib/match-service";
import type { DeliveryEditInput, ExtraType } from "@/lib/recompute";
import type { DismissalType } from "@/lib/types";

const EXTRA_TYPES = new Set<ExtraType>([
  "none",
  "wide",
  "nb",
  "bye",
  "leg_bye",
]);

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ writeToken: string; deliveryId: string }> },
) {
  try {
    const { writeToken, deliveryId } = await ctx.params;
    const token = decodeURIComponent(writeToken);
    const body = (await req.json()) as Partial<DeliveryEditInput>;
    const extraType = EXTRA_TYPES.has(body.extraType as ExtraType)
      ? (body.extraType as ExtraType)
      : "none";

    const input: DeliveryEditInput = {
      strikerId: String(body.strikerId ?? ""),
      nonStrikerId: String(body.nonStrikerId ?? ""),
      bowlerId: body.bowlerId ? String(body.bowlerId) : null,
      runsOffBat: Number(body.runsOffBat) || 0,
      extraType,
      extraRuns: Number(body.extraRuns) || 0,
      isWicket: Boolean(body.isWicket),
      dismissal: (body.dismissal as DismissalType) || "none",
      dismissedBatsmanId: body.dismissedBatsmanId
        ? String(body.dismissedBatsmanId)
        : null,
      incomingStrikerId: body.incomingStrikerId
        ? String(body.incomingStrikerId)
        : null,
      fielderId: body.fielderId ? String(body.fielderId) : null,
      fielderAssistId: body.fielderAssistId
        ? String(body.fielderAssistId)
        : null,
    };

    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    const result = await updateDelivery(token, deliveryId, input, cookie);
    return ok(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
