"use client";

import HudModal from "@/components/HudModal";
import PickerField from "@/components/scorer/PickerField";
import {
  DISMISSAL_OPTIONS,
  RUN_OUT_RUNS,
  type DismissalOption,
} from "@/lib/delivery-presets";
import type { DeliveryInput } from "@/lib/match-service";
import type { DismissalType } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

type PlayerPick = { id: string; display_name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  strikerId: string;
  nonStrikerId: string;
  strikerName: string;
  nonStrikerName: string;
  batsmen: PlayerPick[];
  fielders: PlayerPick[];
  onSubmit: (payload: Omit<DeliveryInput, "bowlerId">) => void | Promise<void>;
};

export default function WicketHud({
  open,
  onClose,
  busy,
  strikerId,
  nonStrikerId,
  strikerName,
  nonStrikerName,
  batsmen,
  fielders,
  onSubmit,
}: Props) {
  const [step, setStep] = useState<"type" | "detail">("type");
  const [dismissal, setDismissal] = useState<DismissalType>("bowled");
  const [outId, setOutId] = useState(strikerId);
  const [runsOffBat, setRunsOffBat] = useState(0);
  const [extraByes, setExtraByes] = useState(0);
  const [fielderId, setFielderId] = useState("");
  const [fielderAssistId, setFielderAssistId] = useState("");
  const [incomingId, setIncomingId] = useState("");

  const option = useMemo(
    () => DISMISSAL_OPTIONS.find((o) => o.id === dismissal),
    [dismissal],
  );

  useEffect(() => {
    if (!open) return;
    setStep("type");
    setDismissal("bowled");
    setOutId(strikerId);
    setRunsOffBat(0);
    setExtraByes(0);
    setFielderId("");
    setFielderAssistId("");
    setIncomingId("");
  }, [open, strikerId]);

  const incomingCandidates = useMemo(
    () =>
      batsmen.filter(
        (p) =>
          p.id !== strikerId &&
          p.id !== nonStrikerId &&
          p.id !== outId,
      ),
    [batsmen, strikerId, nonStrikerId, outId],
  );

  const fielderOptions = useMemo(
    () => fielders.map((p) => ({ id: p.id, label: p.display_name })),
    [fielders],
  );

  const assistOptions = useMemo(
    () =>
      fielders
        .filter((p) => p.id !== fielderId)
        .map((p) => ({ id: p.id, label: p.display_name })),
    [fielders, fielderId],
  );

  const incomingOptions = useMemo(
    () => incomingCandidates.map((p) => ({ id: p.id, label: p.display_name })),
    [incomingCandidates],
  );

  function pickType(opt: DismissalOption) {
    setDismissal(opt.id);
    setOutId(strikerId);
    setStep("detail");
  }

  function confirm() {
    if (!option) return;
    if (option.needsFielder && !fielderId) return;
    if (!option.retiresInPlace && !incomingId) return;

    onSubmit({
      runsOffBat: option.allowRuns ? runsOffBat : 0,
      extraWide: 0,
      extraNb: 0,
      extraByes: option.allowRuns ? extraByes : 0,
      extraLegByes: 0,
      countsAsLegalDelivery: true,
      isWicket: true,
      dismissal,
      dismissedBatsmanId: outId,
      fielderId: option.needsFielder ? fielderId : undefined,
      fielderAssistId:
        option.id === "run_out" && fielderAssistId ? fielderAssistId : undefined,
      incomingStrikerId: option.retiresInPlace ? undefined : incomingId,
    });
  }

  return (
    <HudModal open={open} title="Wicket" onBackdropClick={onClose}>
      {step === "type" ? (
        <>
          <p className="mb-3 text-sm opacity-85">How was the batter out?</p>
          <div className="grid grid-cols-2 gap-2">
            {DISMISSAL_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={busy}
                onClick={() => pickType(opt)}
                className="chip-btn wicket text-left disabled:opacity-40"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="hud-btn mt-4 w-full"
            onClick={onClose}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="mb-3 min-h-[44px] text-sm text-emerald-300 underline"
            onClick={() => setStep("type")}
          >
            ← Change dismissal ({option?.label})
          </button>

          {option?.allowNonStrikerOut && (
            <fieldset className="mb-3">
              <legend className="picker-label">Who is out?</legend>
              <div className="touch-choice">
                <button
                  type="button"
                  className={`touch-choice-btn${outId === strikerId ? " selected" : ""}`}
                  onClick={() => setOutId(strikerId)}
                >
                  Striker — {strikerName}
                </button>
                <button
                  type="button"
                  className={`touch-choice-btn${outId === nonStrikerId ? " selected" : ""}`}
                  onClick={() => setOutId(nonStrikerId)}
                >
                  Non-striker — {nonStrikerName}
                </button>
              </div>
            </fieldset>
          )}

          {option?.allowRuns && (
            <div className="mb-3 space-y-2">
              <p className="picker-label">Runs completed</p>
              <div className="run-pick-row">
                {RUN_OUT_RUNS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRunsOffBat(n)}
                    className={`run-pick-btn${runsOffBat === n ? " selected" : ""}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>Byes on run-out (optional)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={6}
                  value={extraByes}
                  onChange={(e) => setExtraByes(Number(e.target.value) || 0)}
                  className="input-select"
                />
              </label>
            </div>
          )}

          {option?.needsFielder && (
            <div className="mb-1">
              <PickerField
                label="Fielder"
                value={fielderId}
                onChange={setFielderId}
                options={fielderOptions}
                placeholder="Select fielder…"
                required
                disabled={busy}
              />
              {option.id === "run_out" && (
                <PickerField
                  label="Assist (optional)"
                  value={fielderAssistId}
                  onChange={setFielderAssistId}
                  options={[{ id: "", label: "None" }, ...assistOptions]}
                  placeholder="None"
                  disabled={busy}
                />
              )}
            </div>
          )}

          {!option?.retiresInPlace && (
            <PickerField
              label="Incoming batter"
              value={incomingId}
              onChange={setIncomingId}
              options={incomingOptions}
              placeholder="Select…"
              required
              disabled={busy}
            />
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="hud-btn flex-1"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                busy ||
                (option?.needsFielder && !fielderId) ||
                (!option?.retiresInPlace && !incomingId)
              }
              className="hud-btn danger flex-1 disabled:opacity-40"
              onClick={() => confirm()}
            >
              Record wicket
            </button>
          </div>
        </>
      )}
    </HudModal>
  );
}
