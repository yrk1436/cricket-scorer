"use client";

import HudModal from "@/components/HudModal";
import PickerField from "@/components/scorer/PickerField";
import { useEffect, useState } from "react";

type PlayerPick = { id: string; display_name: string };

type Props = {
  open: boolean;
  busy?: boolean;
  end?: "striker" | "non_striker";
  leavingName?: string;
  pickLeaving?: boolean;
  leavingOptions?: PlayerPick[];
  candidates: PlayerPick[];
  onClose: () => void;
  onConfirm: (payload: {
    incomingPlayerId: string;
    leavingPlayerId?: string;
  }) => void | Promise<void>;
};

export default function ReplaceBatterHud({
  open,
  busy,
  end,
  leavingName,
  pickLeaving,
  leavingOptions,
  candidates,
  onClose,
  onConfirm,
}: Props) {
  const [incomingId, setIncomingId] = useState("");
  const [leavingId, setLeavingId] = useState("");

  useEffect(() => {
    if (open) {
      setIncomingId("");
      setLeavingId("");
    }
  }, [open, end]);

  const leavingLabel =
    leavingName ??
    leavingOptions?.find((p) => p.id === leavingId)?.display_name ??
    "this batter";

  const title = pickLeaving
    ? "Correct batter"
    : `Replace ${end === "striker" ? "striker" : "non-striker"}`;

  const options = candidates.map((p) => ({ id: p.id, label: p.display_name }));
  const leavingPickerOptions =
    leavingOptions?.map((p) => ({ id: p.id, label: p.display_name })) ?? [];

  return (
    <HudModal open={open} title={title} onBackdropClick={onClose}>
      {pickLeaving ? (
        <p className="mb-3 text-sm opacity-85">
          Pick who was recorded wrongly and who should get their runs, balls,
          and dismissal this innings.
        </p>
      ) : (
        <p className="mb-3 text-sm opacity-85">
          All of <strong>{leavingLabel}</strong>&apos;s runs, balls, and
          dismissals this innings move to the replacement.
        </p>
      )}

      {pickLeaving ? (
        <PickerField
          label="Recorded as (wrong)"
          value={leavingId}
          onChange={setLeavingId}
          options={leavingPickerOptions}
          placeholder="Select…"
          required
          disabled={busy}
        />
      ) : null}

      <PickerField
        label={pickLeaving ? "Should have been" : "Replacement batter"}
        value={incomingId}
        onChange={setIncomingId}
        options={options.filter((o) => o.id !== leavingId)}
        placeholder="Select…"
        required
        disabled={busy}
      />

      <div className="mt-4 flex gap-2">
        <button type="button" className="hud-btn flex-1" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !incomingId || (pickLeaving && !leavingId)}
          className="hud-btn primary flex-1 disabled:opacity-50"
          onClick={() =>
            void onConfirm({
              incomingPlayerId: incomingId,
              leavingPlayerId: pickLeaving ? leavingId : undefined,
            })
          }
        >
          {pickLeaving ? "Apply correction" : "Replace batter"}
        </button>
      </div>
    </HudModal>
  );
}
