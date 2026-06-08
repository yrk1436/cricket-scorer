import { cookies } from "next/headers";
import { bad, ok } from "@/lib/api-json";
import { EDIT_COOKIE_NAME } from "@/lib/edit-unlock";
import type { DismissalType } from "@/lib/types";
import { appendDelivery, type DeliveryInput } from "@/lib/match-service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ writeToken: string }> },
) {
  try {
    const { writeToken } = await ctx.params;
    const token = decodeURIComponent(writeToken);
    const body = (await req.json()) as Partial<DeliveryInput> & {
      dismissal?: string;
      strikeSwap?: boolean;
      bowlerId?: string;
      dismissedBatsmanId?: string;
      fielderId?: string;
      fielderAssistId?: string;
    };

    const input: DeliveryInput = {
      runsOffBat: Math.min(6, Math.max(0, Number(body.runsOffBat) || 0)),
      extraWide: Math.max(0, Number(body.extraWide) || 0),
      extraNb: Math.max(0, Number(body.extraNb) || 0),
      extraByes: Math.max(0, Number(body.extraByes) || 0),
      extraLegByes: Math.max(0, Number(body.extraLegByes) || 0),
      countsAsLegalDelivery: Boolean(body.countsAsLegalDelivery),
      isWicket: Boolean(body.isWicket),
      dismissal: (body.dismissal as DismissalType) || "none",
      note: body.note ? String(body.note) : undefined,
      strikeSwap: Boolean(body.strikeSwap),
      bowlerId: body.bowlerId ? String(body.bowlerId) : undefined,
      incomingStrikerId: body.incomingStrikerId
        ? String(body.incomingStrikerId)
        : undefined,
      dismissedBatsmanId: body.dismissedBatsmanId
        ? String(body.dismissedBatsmanId)
        : undefined,
      fielderId: body.fielderId ? String(body.fielderId) : undefined,
      fielderAssistId: body.fielderAssistId
        ? String(body.fielderAssistId)
        : undefined,
    };

    const cookie = (await cookies()).get(EDIT_COOKIE_NAME)?.value;
    await appendDelivery(token, input, cookie);
    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return bad(msg, 400);
  }
}
