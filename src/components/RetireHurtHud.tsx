"use client";

import HudModal from "@/components/HudModal";
import PickerField from "@/components/scorer/PickerField";
import { useEffect, useState } from "react";

type PlayerPick = { id: string; display_name: string };

type Props = {
  open: boolean;
  busy?: boolean;
  strikerName: string;
  nonStrikerName: string;
  candidates: PlayerPick[];
  onClose: () => void;
  onConfirm: (payload: {
    end: "striker" | "non_striker";
    replacementPlayerId: string;
  }) => void | Promise<void>;
};

export default function RetireHurtHud({
  open,
  busy,
  strikerName,
  nonStrikerName,
  candidates,
  onClose,
  onConfirm,
}: Props) {
  const [end, setEnd] = useState<"striker" | "non_striker">("striker");
  const [replacementId, setReplacementId] = useState("");

  useEffect(() => {
    if (open) {
      setEnd("striker");
      setReplacementId("");
    }
  }, [open]);

  const retiringName = end === "striker" ? strikerName : nonStrikerName;
  const options = candidates.map((p) => ({ id: p.id, label: p.display_name }));

  return (
    <HudModal open={open} title="Retire batter hurt" onBackdropClick={onClose}>
      <p className="mb-3 text-sm opacity-85">
        Retire a batter due to injury or illness. This is not a dismissal —
        wickets stay the same. The retired batter can return later when a new
        batter is needed.
      </p>

      <fieldset className="mb-3">
        <legend className="picker-label">Who is retiring?</legend>
        <div className="touch-choice">
          <button
            type="button"
            className={`touch-choice-btn${end === "striker" ? " selected" : ""}`}
            onClick={() => setEnd("striker")}
            disabled={busy}
          >
            Striker — {strikerName}
          </button>
          <button
            type="button"
            className={`touch-choice-btn${end === "non_striker" ? " selected" : ""}`}
            onClick={() => setEnd("non_striker")}
            disabled={busy}
          >
            Non-striker — {nonStrikerName}
          </button>
        </div>
      </fieldset>

      <p className="mb-2 text-sm opacity-80">
        <strong>{retiringName}</strong> will be marked as retired not out. Their
        runs and balls faced are preserved.
      </p>

      {candidates.length === 0 ? (
        <p className="mb-3 text-sm text-amber-200/90">
          No eligible replacements available. All other batters are either out
          or marked did-not-bat.
        </p>
      ) : (
        <PickerField
          label="Replacement batter"
          value={replacementId}
          onChange={setReplacementId}
          options={options}
          placeholder="Select…"
          required
          disabled={busy}
        />
      )}

      <div className="mt-4 flex gap-2">
        <button type="button" className="hud-btn flex-1" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !replacementId || candidates.length === 0}
          className="hud-btn primary flex-1 disabled:opacity-50"
          onClick={() =>
            void onConfirm({ end, replacementPlayerId: replacementId })
          }
        >
          Retire batter
        </button>
      </div>
    </HudModal>
  );
}
