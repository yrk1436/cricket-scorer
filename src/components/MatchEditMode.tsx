"use client";

import HudModal from "@/components/HudModal";
import PickerField, { PickerGroup } from "@/components/scorer/PickerField";
import { DISMISSAL_OPTIONS } from "@/lib/delivery-presets";
import { ballsToOvers, opposite, totalRunsOnDelivery } from "@/lib/game";
import {
  deliveryEditFromRow,
  groupDeliveriesByOver,
  isRetirementDismissal,
  type DeliveryEditInput,
  type ExtraType,
} from "@/lib/recompute";
import type { SerialBundle } from "@/lib/scorecard-text";
import type { DbDelivery, DismissalType, TeamSide } from "@/lib/types";
import { useMemo, useState } from "react";

type Props = {
  bundle: SerialBundle;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (deliveryId: string, input: DeliveryEditInput) => Promise<boolean>;
};

function extraShort(d: DbDelivery): string {
  if (d.extra_wide > 0) return d.extra_wide === 1 ? "wd" : `${d.extra_wide}wd`;
  if (d.extra_nb > 0) {
    return d.runs_off_bat > 0 ? `nb+${d.runs_off_bat}` : "nb";
  }
  if (d.extra_byes > 0) return `${d.extra_byes}b`;
  if ((d.extra_leg_byes ?? 0) > 0) return `${d.extra_leg_byes}lb`;
  return String(d.runs_off_bat);
}

function wicketShort(d: DbDelivery): string {
  if (!d.is_wicket) return "";
  if (d.dismissal === "retired_hurt") return "retired not out";
  if (d.dismissal === "retired_out") return "retired out";
  return d.dismissal === "none" ? "out" : d.dismissal.replace("_", " ");
}

export default function MatchEditMode({
  bundle,
  busy,
  error,
  onClose,
  onSave,
}: Props) {
  const { match, players, innings, deliveriesByInningsId } = bundle;
  const [editing, setEditing] = useState<DbDelivery | null>(null);
  const [form, setForm] = useState<DeliveryEditInput | null>(null);

  const sideName = (side: TeamSide) =>
    side === "a" ? match.team_a_name : match.team_b_name;
  const pName = (id: string | null | undefined) =>
    players.find((p) => p.id === id)?.display_name ?? "—";

  const sortedInns = useMemo(
    () => [...innings].sort((a, b) => a.index_num - b.index_num),
    [innings],
  );

  const history = match.edit_history ?? [];

  function openBall(d: DbDelivery) {
    setEditing(d);
    setForm(deliveryEditFromRow(d));
  }

  function closeEditor() {
    setEditing(null);
    setForm(null);
  }

  const editorInn = editing
    ? innings.find((i) => i.id === editing.innings_id)
    : null;
  const batSide = (editorInn?.batting_side ?? "a") as TeamSide;
  const bowlSide = opposite(batSide);
  const batsmen = players.filter((p) => p.side === batSide && !p.did_not_bat);
  const bowlers = players.filter((p) => p.side === bowlSide && !p.did_not_bat);
  const fielders = bowlers;

  const retirement =
    !!form?.isWicket && isRetirementDismissal(form.dismissal);
  const dismissalOpt = DISMISSAL_OPTIONS.find((o) => o.id === form?.dismissal);
  const showRunsOffBat =
    !!form &&
    !retirement &&
    form.extraType !== "wide" &&
    form.extraType !== "bye" &&
    form.extraType !== "leg_bye";
  const incomingOptions = batsmen
    .filter(
      (p) =>
        p.id !== form?.strikerId &&
        p.id !== form?.nonStrikerId &&
        p.id !== form?.dismissedBatsmanId,
    )
    .map((p) => ({ id: p.id, label: p.display_name }));

  async function save() {
    if (!editing || !form) return;
    const ok = await onSave(editing.id, form);
    if (ok) closeEditor();
  }

  return (
    <div className="phone-shell">
      <header className="top-bar no-print">
        <div>
          <h1>Edit match</h1>
          <p className="sub">Correct a ball · no insert or delete</p>
        </div>
        <button type="button" className="hud-btn" onClick={onClose}>
          Done
        </button>
      </header>

      {error && <div className="error-banner no-print">{error}</div>}

      {match.result_summary && (
        <p className="chase-bar ok" style={{ margin: 0 }}>
          {match.result_summary}
        </p>
      )}

      {sortedInns.map((inn) => {
        const dels = deliveriesByInningsId[inn.id] ?? [];
        const groups = groupDeliveriesByOver(dels);
        return (
          <section key={inn.id} className="glass edit-innings">
            <h2 className="edit-innings-title">
              Innings {inn.index_num} · {sideName(inn.batting_side as TeamSide)}
              <span>
                {" "}
                {inn.runs}/{inn.wickets} ({ballsToOvers(inn.balls_legal)})
              </span>
            </h2>
            {groups.length === 0 ? (
              <p className="text-xs opacity-50">No balls yet.</p>
            ) : (
              groups.map((g) => (
                <div key={g.over} className="edit-over">
                  <p className="section-title">{g.title}</p>
                  <ul className="edit-ball-list">
                    {g.balls.map((row) => {
                      const d = row.delivery;
                      const wkt = wicketShort(d);
                      return (
                        <li key={d.id}>
                          <button
                            type="button"
                            className={`edit-ball-row${d.is_wicket ? " wicket" : ""}`}
                            disabled={!row.editable || busy}
                            aria-label={
                              row.editable
                                ? `Edit ball ${row.ballLabel}, ${pName(d.striker_id)}`
                                : `Ball ${row.ballLabel} (not editable)`
                            }
                            onClick={() => row.editable && openBall(d)}
                          >
                            <span className="edit-ball-num">{row.ballLabel}</span>
                            <span className="edit-ball-main">
                              <span className="edit-ball-line">
                                {pName(d.striker_id)}
                                {d.bowler_id ? ` · ${pName(d.bowler_id)}` : ""}
                              </span>
                              <span className="edit-ball-meta">
                                NS {pName(d.non_striker_id)}
                                {wkt ? ` · ${wkt}` : ""}
                                {d.dismissed_batsman_id &&
                                d.dismissed_batsman_id !== d.striker_id
                                  ? ` (${pName(d.dismissed_batsman_id)})`
                                  : ""}
                              </span>
                            </span>
                            <span className="edit-ball-score">
                              {d.is_strike_swap
                                ? "⇄"
                                : wkt && totalRunsOnDelivery(d) === 0
                                  ? "W"
                                  : extraShort(d)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>
        );
      })}

      {history.length > 0 && (
        <details className="admin-panel glass no-print">
          <summary>Edit history ({history.length})</summary>
          <ul className="edit-history">
            {[...history].reverse().map((e, i) => (
              <li key={`${e.at}-${e.deliveryId}-${i}`}>
                <p className="edit-history-when">
                  {new Date(e.at).toLocaleString()} · {e.actor} · inns{" "}
                  {e.inningsIndex} · {e.ballLabel}
                </p>
                <p className="edit-history-what">
                  {e.changes
                    .map((c) => `${c.field}: ${c.from} → ${c.to}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <HudModal
        open={!!editing && !!form}
        title={editing ? `Edit ball` : "Edit ball"}
        onBackdropClick={closeEditor}
      >
        {form && editing && (
          <PickerGroup>
            {error ? (
              <div className="error-banner mb-3" role="alert">
                {error}
              </div>
            ) : null}
            <p className="mb-3 text-sm opacity-80">
              Changes apply to this ball only. Later balls keep their recorded
              crease — “swap from here onward” comes later.
            </p>
            <PickerField
              label="Striker"
              value={form.strikerId}
              onChange={(id) => setForm((f) => (f ? { ...f, strikerId: id } : f))}
              options={batsmen.map((p) => ({ id: p.id, label: p.display_name }))}
              required
              disabled={busy}
            />
            <PickerField
              label="Non-striker"
              value={form.nonStrikerId}
              onChange={(id) =>
                setForm((f) => (f ? { ...f, nonStrikerId: id } : f))
              }
              options={batsmen.map((p) => ({ id: p.id, label: p.display_name }))}
              required
              disabled={busy}
            />
            {!retirement && (
              <PickerField
                label="Bowler"
                value={form.bowlerId ?? ""}
                onChange={(id) =>
                  setForm((f) => (f ? { ...f, bowlerId: id || null } : f))
                }
                options={bowlers.map((p) => ({
                  id: p.id,
                  label: p.display_name,
                }))}
                required
                disabled={busy}
              />
            )}

            {showRunsOffBat && (
              <div className="mb-3">
                <p className="picker-label">Runs off bat</p>
                <div className="run-pick-row">
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`run-pick-btn${form.runsOffBat === n ? " selected" : ""}`}
                      onClick={() =>
                        setForm((f) => (f ? { ...f, runsOffBat: n } : f))
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!retirement && (
              <div className="mb-3">
                <p className="picker-label">Extras</p>
                <div className="touch-choice">
                  {(
                    [
                      ["none", "None"],
                      ["wide", "Wide"],
                      ["nb", "No-ball"],
                      ["bye", "Bye"],
                      ["leg_bye", "Leg bye"],
                    ] as [ExtraType, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`touch-choice-btn${form.extraType === id ? " selected" : ""}`}
                      onClick={() =>
                        setForm((f) =>
                          f
                            ? {
                                ...f,
                                extraType: id,
                                extraRuns:
                                  id === "wide" || id === "nb"
                                    ? Math.max(1, f.extraRuns)
                                    : id === "none"
                                      ? 0
                                      : Math.max(1, f.extraRuns || 1),
                              }
                            : f,
                        )
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {form.extraType !== "none" && (
                  <div className="run-pick-row" style={{ marginTop: 8 }}>
                    {(form.extraType === "wide" || form.extraType === "nb"
                      ? [1, 2, 3, 4, 5]
                      : [1, 2, 3, 4]
                    ).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`run-pick-btn${form.extraRuns === n ? " selected" : ""}`}
                        onClick={() =>
                          setForm((f) => (f ? { ...f, extraRuns: n } : f))
                        }
                      >
                        {form.extraType === "wide"
                          ? n === 1
                            ? "wd"
                            : `wd+${n - 1}`
                          : form.extraType === "nb"
                            ? n === 1
                              ? "nb"
                              : `nb ${n}`
                            : n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mb-3">
              <p className="picker-label">Wicket / retirement</p>
              <div className="touch-choice">
                <button
                  type="button"
                  className={`touch-choice-btn${!form.isWicket ? " selected" : ""}`}
                  onClick={() =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            isWicket: false,
                            dismissal: "none",
                            dismissedBatsmanId: null,
                            incomingStrikerId: null,
                            fielderId: null,
                            fielderAssistId: null,
                          }
                        : f,
                    )
                  }
                >
                  None
                </button>
                {DISMISSAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`touch-choice-btn${form.isWicket && form.dismissal === opt.id ? " selected" : ""}`}
                    onClick={() =>
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              isWicket: true,
                              dismissal: opt.id as DismissalType,
                              dismissedBatsmanId:
                                f.dismissedBatsmanId || f.strikerId,
                              extraType: opt.isNotABall ? "none" : f.extraType,
                              extraRuns: opt.isNotABall ? 0 : f.extraRuns,
                              runsOffBat: opt.isNotABall ? 0 : f.runsOffBat,
                            }
                          : f,
                      )
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {form.isWicket && (
              <>
                <div className="mb-3">
                  <p className="picker-label">
                    {dismissalOpt?.allowEitherBatter
                      ? "Who is retiring?"
                      : "Who is out?"}
                  </p>
                  <div className="touch-choice">
                    <button
                      type="button"
                      className={`touch-choice-btn${form.dismissedBatsmanId === form.strikerId ? " selected" : ""}`}
                      onClick={() =>
                        setForm((f) =>
                          f ? { ...f, dismissedBatsmanId: f.strikerId } : f,
                        )
                      }
                    >
                      Striker — {pName(form.strikerId)}
                    </button>
                    {(dismissalOpt?.allowNonStrikerOut ||
                      dismissalOpt?.allowEitherBatter) && (
                      <button
                        type="button"
                        className={`touch-choice-btn${form.dismissedBatsmanId === form.nonStrikerId ? " selected" : ""}`}
                        onClick={() =>
                          setForm((f) =>
                            f
                              ? { ...f, dismissedBatsmanId: f.nonStrikerId }
                              : f,
                          )
                        }
                      >
                        Non-striker — {pName(form.nonStrikerId)}
                      </button>
                    )}
                  </div>
                </div>

                {dismissalOpt?.needsFielder && (
                  <>
                    <PickerField
                      label="Fielder"
                      value={form.fielderId ?? ""}
                      onChange={(id) =>
                        setForm((f) =>
                          f ? { ...f, fielderId: id || null } : f,
                        )
                      }
                      options={fielders.map((p) => ({
                        id: p.id,
                        label: p.display_name,
                      }))}
                      required
                      disabled={busy}
                    />
                    {form.dismissal === "run_out" && (
                      <PickerField
                        label="Assist (optional)"
                        value={form.fielderAssistId ?? ""}
                        onChange={(id) =>
                          setForm((f) =>
                            f ? { ...f, fielderAssistId: id || null } : f,
                          )
                        }
                        options={[
                          { id: "", label: "None" },
                          ...fielders
                            .filter((p) => p.id !== form.fielderId)
                            .map((p) => ({
                              id: p.id,
                              label: p.display_name,
                            })),
                        ]}
                        disabled={busy}
                      />
                    )}
                  </>
                )}

                {incomingOptions.length > 0 && (
                  <PickerField
                    label="Incoming batter"
                    value={form.incomingStrikerId ?? ""}
                    onChange={(id) =>
                      setForm((f) =>
                        f ? { ...f, incomingStrikerId: id || null } : f,
                      )
                    }
                    options={[
                      { id: "", label: "None / already recorded later" },
                      ...incomingOptions,
                    ]}
                    disabled={busy}
                  />
                )}
              </>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={closeEditor}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hud-btn primary flex-1 disabled:opacity-40"
                disabled={
                  busy ||
                  !form.strikerId ||
                  !form.nonStrikerId ||
                  form.strikerId === form.nonStrikerId ||
                  (!retirement && !form.bowlerId)
                }
                onClick={() => void save()}
              >
                Save correction
              </button>
            </div>
          </PickerGroup>
        )}
      </HudModal>
    </div>
  );
}
