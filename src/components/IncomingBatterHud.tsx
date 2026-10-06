"use client";

import HudModal from "@/components/HudModal";
import PickerField from "@/components/scorer/PickerField";
import { useState, useMemo } from "react";

type PlayerPick = { id: string; display_name: string };

type Props = {
  open: boolean;
  busy?: boolean;
  dismissedName: string;
  candidates: PlayerPick[];
  onClose: () => void;
  onConfirm: (incomingPlayerId: string) => Promise<void> | void;
};

export default function IncomingBatterHud({
  open,
  busy,
  dismissedName,
  candidates,
  onClose,
  onConfirm,
}: Props) {
  const [selectedId, setSelectedId] = useState("");

  const options = useMemo(
    () => candidates.map((p) => ({ id: p.id, label: p.display_name })),
    [candidates],
  );

  return (
    <HudModal open={open} title="Select incoming batter" onBackdropClick={onClose}>
      <p className="mb-3 text-sm opacity-85">
        {dismissedName} is out. Choose who comes in next.
      </p>
      <PickerField
        label="Incoming batter"
        value={selectedId}
        onChange={setSelectedId}
        options={options}
        placeholder="Select…"
        required
        disabled={busy}
      />
      <div className="flex gap-2 pt-3">
        <button
          type="button"
          className="hud-btn flex-1"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !selectedId}
          className="hud-btn primary flex-1 disabled:opacity-50"
          onClick={() => {
            if (selectedId) {
              void onConfirm(selectedId);
            }
          }}
        >
          Confirm
        </button>
      </div>
    </HudModal>
  );
}
