"use client";

import HudModal from "@/components/HudModal";
import {
  BYE_PRESETS,
  LEG_BYE_PRESETS,
  NO_BALL_BAT_RUNS,
  WIDE_PRESETS,
  byeDelivery,
  legByeDelivery,
  noBallDelivery,
  wideDelivery,
} from "@/lib/delivery-presets";
import type { DeliveryInput } from "@/lib/match-service";
import { useState } from "react";

type ExtraTab = "wide" | "noball" | "bye" | "legbye";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: Omit<DeliveryInput, "bowlerId">) => void | Promise<void>;
  busy?: boolean;
};

export default function ExtrasHud({ open, onClose, onSubmit, busy }: Props) {
  const [tab, setTab] = useState<ExtraTab>("wide");

  function pick(payload: Omit<DeliveryInput, "bowlerId">) {
    onSubmit(payload);
  }

  const tabs: { id: ExtraTab; label: string }[] = [
    { id: "wide", label: "Wide" },
    { id: "noball", label: "No-ball" },
    { id: "bye", label: "Bye" },
    { id: "legbye", label: "Leg bye" },
  ];

  return (
    <HudModal open={open} title="Extras" onBackdropClick={onClose}>
      <p className="mb-3 text-sm opacity-85">
        Wide and no-ball do not use a legal ball. Byes and leg-byes count as a
        legal delivery.
      </p>
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold ${
              tab === t.id
                ? "bg-emerald-600 text-white"
                : "text-white/70 hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "wide" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WIDE_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => pick(wideDelivery(n))}
              className="chip-btn extras disabled:opacity-40"
            >
              wd+{n}
            </button>
          ))}
        </div>
      )}

      {tab === "noball" && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {NO_BALL_BAT_RUNS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => pick(noBallDelivery(n))}
              className="chip-btn extras disabled:opacity-40"
            >
              {n === 0 ? "nb" : `nb+${n}`}
            </button>
          ))}
        </div>
      )}

      {tab === "bye" && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {BYE_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => pick(byeDelivery(n))}
              className="chip-btn disabled:opacity-40"
              style={{ borderColor: "rgba(167,139,250,0.4)", color: "#ddd6fe" }}
            >
              {n === 0 ? "b" : `b+${n}`}
            </button>
          ))}
        </div>
      )}

      {tab === "legbye" && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {LEG_BYE_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => pick(legByeDelivery(n))}
              className="chip-btn disabled:opacity-40"
              style={{ borderColor: "rgba(167,139,250,0.4)", color: "#ddd6fe" }}
            >
              {n === 0 ? "lb" : `lb+${n}`}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="hud-btn mt-4 w-full"
        onClick={onClose}
      >
        Cancel
      </button>
    </HudModal>
  );
}
