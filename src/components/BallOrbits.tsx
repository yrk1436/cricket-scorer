"use client";

import { currentOverDeliveries, totalRunsOnDelivery } from "@/lib/game";
import type { DbDelivery } from "@/lib/types";

function shortLabel(d: DbDelivery): string {
  if (d.is_strike_swap) return "⇄";
  if (d.is_wicket && d.dismissal === "retired_hurt") return "RNO";
  if (d.is_wicket && d.dismissal === "retired_out") return "RO";
  if (d.is_wicket) return "W";
  if (d.extra_wide > 0) {
    const extra = d.extra_wide - 1;
    return extra > 0 ? `wd+${extra}` : "wd";
  }
  if (d.extra_nb > 0) {
    return d.runs_off_bat > 0 ? `nb+${d.runs_off_bat}` : "nb";
  }
  const leg = d.extra_leg_byes ?? 0;
  if (leg > 0) return leg > 1 ? `${leg}lb` : "lb";
  const t = totalRunsOnDelivery(d);
  if (!d.counts_as_legal_delivery && !d.is_strike_swap && d.extra_byes > 0)
    return d.extra_byes > 1 ? `${d.extra_byes}b` : "b";
  if (!d.counts_as_legal_delivery && t > 0) return `${t}x`;
  if (t === 0 && d.counts_as_legal_delivery) return "0";
  return String(t);
}

function ballClass(d: DbDelivery): string {
  if (d.is_strike_swap) return "swap";
  if (d.is_wicket) return "wicket";
  if (d.extra_wide > 0) return "wide";
  if (d.extra_nb > 0) return "nb";
  if ((d.extra_byes ?? 0) > 0 || (d.extra_leg_byes ?? 0) > 0) return "bye";
  const t = totalRunsOnDelivery(d);
  if (t === 0 && d.counts_as_legal_delivery) return "dot";
  return "run";
}

type Props = {
  deliveries: DbDelivery[];
  /** Scorer: current over. Scorecard: rolling last 10 (default). */
  variant?: "last10" | "currentOver";
  maxBallsPerOver?: number;
};

export default function BallOrbits({
  deliveries,
  variant = "last10",
  maxBallsPerOver = 0,
}: Props) {
  const chips =
    variant === "currentOver"
      ? currentOverDeliveries(deliveries, maxBallsPerOver)
      : [...deliveries]
          .sort((a, b) => a.display_order - b.display_order)
          .slice(-10);

  if (chips.length === 0) {
    return (
      <p className="text-xs opacity-50">
        {variant === "currentOver" ? "No balls this over yet." : "No balls yet."}
      </p>
    );
  }

  return (
    <div
      className={
        variant === "currentOver" ? "orbit-strip orbit-strip--over" : "orbit-strip"
      }
    >
      {chips.map((d) => {
        const tipParts = [`#${d.display_order}`];
        if (d.is_wicket && !d.is_strike_swap) tipParts.push(d.dismissal);

        return (
          <div
            key={d.id}
            title={tipParts.filter(Boolean).join(" · ")}
            className={`ball ${ballClass(d)}`}
          >
            {shortLabel(d)}
          </div>
        );
      })}
    </div>
  );
}
