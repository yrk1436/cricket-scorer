"use client";

import HudModal from "@/components/HudModal";
import PickerField, { PickerGroup } from "@/components/scorer/PickerField";
import { DISMISSAL_OPTIONS } from "@/lib/delivery-presets";
import {
  buildApplyPayload,
  changedDeliveries,
  describeDraftOps,
  dismissalCreasePropagation,
  diffMatchScorecards,
  findInningsContinuityIssues,
  replayDraftOps,
  validateDeliveryEdit,
  validateDraftLogs,
  validateReplace,
  type ApplyMatchEditPayload,
  type DiffRow,
  type DraftOp,
} from "@/lib/edit-draft";
import { ballsToOvers, opposite, totalRunsOnDelivery } from "@/lib/game";
import {
  deliveryEditFromRow,
  derivedMatchState,
  groupDeliveriesByOver,
  isRetirementDismissal,
  type DeliveryEditInput,
  type ExtraType,
} from "@/lib/recompute";
import type { SerialBundle } from "@/lib/scorecard-text";
import type { DbDelivery, DismissalType, TeamSide } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  bundle: SerialBundle;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onApply: (payload: ApplyMatchEditPayload) => Promise<boolean>;
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

function changeWord(n: number): string {
  return `${n} unsaved change${n === 1 ? "" : "s"}`;
}

function DiffLines({ rows, onlyChanged }: { rows: DiffRow[]; onlyChanged?: boolean }) {
  const shown = onlyChanged ? rows.filter((r) => r.changed) : rows;
  if (shown.length === 0) return null;
  return (
    <ul className="edit-diff-list">
      {shown.map((row) => (
        <li
          key={row.key}
          className={`edit-diff-row${row.changed ? " changed" : ""}`}
        >
          <span className="edit-diff-label">{row.label}</span>
          <span className="edit-diff-values">
            <span className="edit-diff-from">{row.before}</span>
            <span aria-hidden="true"> → </span>
            <span className="edit-diff-to">{row.after}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function MatchEditMode({
  bundle,
  busy,
  error,
  onClose,
  onApply,
}: Props) {
  const { match, players, innings, deliveriesByInningsId } = bundle;
  const [ops, setOps] = useState<DraftOp[]>([]);
  const [editing, setEditing] = useState<DbDelivery | null>(null);
  const [form, setForm] = useState<DeliveryEditInput | null>(null);
  const [replacing, setReplacing] = useState<DbDelivery | null>(null);
  const [replaceFrom, setReplaceFrom] = useState("");
  const [replaceTo, setReplaceTo] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [propagateDismissed, setPropagateDismissed] = useState(true);
  const [recheckNote, setRecheckNote] = useState<string | null>(null);
  const recheckRef = useRef<HTMLElement | null>(null);

  const dirty = ops.length > 0;
  const sideName = (side: TeamSide) =>
    side === "a" ? match.team_a_name : match.team_b_name;
  const pName = (id: string | null | undefined) =>
    players.find((p) => p.id === id)?.display_name ?? "—";

  const draftDels = useMemo(
    () => replayDraftOps(deliveriesByInningsId, ops),
    [deliveriesByInningsId, ops],
  );

  const changedIds = useMemo(() => {
    return new Set(
      changedDeliveries(deliveriesByInningsId, draftDels).map((d) => d.id),
    );
  }, [deliveriesByInningsId, draftDels]);

  const derived = useMemo(
    () =>
      derivedMatchState({
        teamAName: match.team_a_name,
        teamBName: match.team_b_name,
        inningsCount: match.innings_count,
        players,
        innings,
        deliveriesByInningsId: draftDels,
        maxBallsPerOver: match.max_balls_per_over ?? 0,
      }),
    [match, players, innings, draftDels],
  );

  const diff = useMemo(
    () =>
      dirty
        ? diffMatchScorecards({
            teamAName: match.team_a_name,
            teamBName: match.team_b_name,
            inningsCount: match.innings_count,
            players,
            innings,
            savedDeliveries: deliveriesByInningsId,
            draftDeliveries: draftDels,
            maxBallsPerOver: match.max_balls_per_over ?? 0,
          })
        : null,
    [dirty, match, players, innings, deliveriesByInningsId, draftDels],
  );

  const opSummary = useMemo(
    () => describeDraftOps(deliveriesByInningsId, ops, pName).summary,
    [deliveriesByInningsId, ops, players],
  );

  const sortedInns = useMemo(
    () => [...innings].sort((a, b) => a.index_num - b.index_num),
    [innings],
  );

  const history = match.edit_history ?? [];

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  function openBall(d: DbDelivery) {
    setSheetError(null);
    setEditing(d);
    setForm(deliveryEditFromRow(d));
    setPropagateDismissed(true);
  }

  function closeEditor() {
    setEditing(null);
    setForm(null);
    setSheetError(null);
    setPropagateDismissed(true);
  }

  function requestCloseEditor() {
    if (
      form &&
      editing &&
      JSON.stringify(form) !== JSON.stringify(deliveryEditFromRow(editing))
    ) {
      return;
    }
    closeEditor();
  }

  function openReplace(d: DbDelivery) {
    setSheetError(null);
    setReplacing(d);
    const leaving = d.is_wicket
      ? (d.dismissed_batsman_id ?? d.non_striker_id ?? d.striker_id ?? "")
      : (d.striker_id ?? "");
    const stay =
      leaving === d.striker_id
        ? (d.non_striker_id ?? "")
        : (d.striker_id ?? "");
    setReplaceFrom(leaving);
    setReplaceTo(stay);
  }

  function closeReplace() {
    setReplacing(null);
    setReplaceFrom("");
    setReplaceTo("");
    setSheetError(null);
  }

  const editorInn = editing
    ? innings.find((i) => i.id === editing.innings_id)
    : replacing
      ? innings.find((i) => i.id === replacing.innings_id)
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

  function addBallToDraft() {
    if (!editing || !form || !editorInn) return;
    const inputErr = validateDeliveryEdit({
      delivery: editing,
      input: form,
      battingSide: batSide,
      players,
    });
    if (inputErr) {
      setSheetError(inputErr);
      return;
    }
    const nextOps: DraftOp[] = [
      ...ops,
      {
        kind: "ball",
        deliveryId: editing.id,
        inningsId: editing.innings_id,
        input: form,
        propagateDismissed:
          !!dismissalCreasePropagation(editing, form) && propagateDismissed,
      },
    ];
    const nextDraft = replayDraftOps(deliveriesByInningsId, nextOps);
    const logErr = validateDraftLogs({
      innings,
      players,
      deliveriesByInningsId: nextDraft,
    });
    if (logErr) {
      setSheetError(logErr);
      return;
    }
    setOps(nextOps);
    closeEditor();
  }

  function addReplaceToDraft(next: {
    delivery: DbDelivery;
    fromId: string;
    toId: string;
  }) {
    const inn = innings.find((i) => i.id === next.delivery.innings_id);
    if (!inn) return false;
    const replaceErr = validateReplace({
      delivery: next.delivery,
      fromId: next.fromId,
      toId: next.toId,
      battingSide: inn.batting_side as TeamSide,
      players,
    });
    if (replaceErr) {
      setSheetError(replaceErr);
      return false;
    }
    const nextOps: DraftOp[] = [
      ...ops,
      {
        kind: "replace",
        deliveryId: next.delivery.id,
        inningsId: next.delivery.innings_id,
        fromDisplayOrder: next.delivery.display_order,
        fromId: next.fromId,
        toId: next.toId,
      },
    ];
    const nextDraft = replayDraftOps(deliveriesByInningsId, nextOps);
    const logErr = validateDraftLogs({
      innings,
      players,
      deliveriesByInningsId: nextDraft,
    });
    if (logErr) {
      setSheetError(logErr);
      return false;
    }
    setOps(nextOps);
    closeReplace();
    closeEditor();
    return true;
  }

  function requestClose() {
    if (dirty && !window.confirm(`Discard ${changeWord(ops.length)}?`)) return;
    onClose();
  }

  function discardDraft() {
    if (!dirty) return;
    if (!window.confirm(`Throw away ${changeWord(ops.length)}?`)) return;
    setOps([]);
    setPreviewOpen(false);
    closeEditor();
    closeReplace();
  }

  async function applyDraft() {
    if (!dirty || busy) return;
    const ok = await onApply(
      buildApplyPayload({
        expectedUpdatedAt: match.updated_at,
        deliveriesByInningsId,
        operations: ops,
      }),
    );
    if (ok) {
      setOps([]);
      setPreviewOpen(false);
    }
  }

  const resultText = dirty
    ? derived.result.summary
    : match.result_summary;

  const whoOutPropagation =
    editing && form ? dismissalCreasePropagation(editing, form) : null;

  const continuityIssues = useMemo(
    () =>
      findInningsContinuityIssues({
        innings,
        deliveriesByInningsId: draftDels,
        name: pName,
      }),
    [innings, draftDels, players],
  );

  function runRecheck() {
    const n = findInningsContinuityIssues({
      innings,
      deliveriesByInningsId: draftDels,
      name: pName,
    }).length;
    setRecheckNote(
      n === 0
        ? "No retired or out batter is still batting later."
        : `${n} later-ball problem${n === 1 ? "" : "s"} found.`,
    );
    recheckRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className={`phone-shell${dirty ? " has-edit-dock" : ""}`}>
      <header className="top-bar no-print">
        <div>
          <h1>Edit match</h1>
          <p className="sub">
            {match.team_a_name} vs {match.team_b_name}
          </p>
        </div>
        <button type="button" className="hud-btn" onClick={requestClose}>
          Done
        </button>
      </header>

      {error && <div className="error-banner no-print">{error}</div>}

      {dirty && (
        <p className="edit-draft-inline no-print" aria-live="polite">
          Draft · {opSummary}
        </p>
      )}

      <section
        ref={recheckRef}
        className="glass edit-recheck no-print"
        aria-label="Re-check innings"
      >
        <div className="edit-recheck-head">
          <h2>Re-check innings</h2>
          <button
            type="button"
            className="hud-btn"
            disabled={busy}
            onClick={runRecheck}
          >
            Re-check innings
          </button>
        </div>
        {recheckNote && (
          <p className="edit-recheck-note" role="status">
            {recheckNote}
          </p>
        )}
        {continuityIssues.length === 0 ? (
          <p className="text-xs opacity-70">
            Flags later balls where a batter is still batting after retiring or
            being out.
          </p>
        ) : (
          <ul className="edit-recheck-list">
            {continuityIssues.map((issue) => (
              <li key={`${issue.sourceDeliveryId}-${issue.removeId}`}>
                <p>{issue.detail}</p>
                <button
                  type="button"
                  className="hud-btn primary"
                  disabled={busy}
                  onClick={() => {
                    const start = draftDels[issue.inningsId]?.find(
                      (d) => d.id === issue.fromDeliveryId,
                    );
                    if (!start) return;
                    addReplaceToDraft({
                      delivery: start,
                      fromId: issue.removeId,
                      toId: issue.stayId,
                    });
                  }}
                >
                  {issue.fixLabel}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {resultText && (
        <p className={`chase-bar${dirty ? " ok" : " ok"}`} style={{ margin: 0 }}>
          {resultText}
          {dirty ? " · draft" : ""}
        </p>
      )}

      {sortedInns.map((inn) => {
        const dels = draftDels[inn.id] ?? [];
        const groups = groupDeliveriesByOver(dels);
        const derivedInn = derived.innings.find((d) => d.id === inn.id);
        const runs = derivedInn?.runs ?? inn.runs;
        const wickets = derivedInn?.wickets ?? inn.wickets;
        const balls = derivedInn?.balls_legal ?? inn.balls_legal;
        return (
          <section key={inn.id} className="glass edit-innings">
            <h2 className="edit-innings-title">
              Innings {inn.index_num} · {sideName(inn.batting_side as TeamSide)}
              <span>
                {" "}
                {runs}/{wickets} ({ballsToOvers(balls)})
                {dirty ? " · draft" : ""}
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
                      const changed = changedIds.has(d.id);
                      return (
                        <li key={d.id} className="edit-ball-item">
                          <button
                            type="button"
                            className={`edit-ball-row${d.is_wicket ? " wicket" : ""}${changed ? " changed" : ""}`}
                            disabled={!row.editable || busy}
                            aria-label={
                              row.editable
                                ? `Edit ball ${row.ballLabel}, ${pName(d.striker_id)}${changed ? ", changed" : ""}`
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
                              {changed ? (
                                <span className="edit-changed-mark">changed</span>
                              ) : null}
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
              <li key={`${e.at}-${e.kind ?? "ball"}-${e.deliveryId ?? i}`}>
                <p className="edit-history-when">
                  {new Date(e.at).toLocaleString()} · {e.actor}
                  {e.kind === "session"
                    ? e.summary
                      ? ` · ${e.summary}`
                      : ""
                    : ` · inns ${e.inningsIndex} · ${e.ballLabel}`}
                </p>
                {e.kind === "session" && e.operations?.length ? (
                  <ul className="edit-history-ops">
                    {e.operations.map((op, j) => (
                      <li key={`${e.at}-op-${j}`}>{op.summary}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="edit-history-what">
                    {e.changes
                      .map((c) => `${c.field}: ${c.from} → ${c.to}`)
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <HudModal
        open={!!editing && !!form}
        title="Edit ball"
        onBackdropClick={requestCloseEditor}
        onEscape={requestCloseEditor}
      >
        {form && editing && (
          <PickerGroup>
            {sheetError ? (
              <div className="error-banner mb-3" role="alert">
                {sheetError}
              </div>
            ) : null}
            <p className="mb-3 text-sm opacity-80">
              Added to the draft only. Nothing is saved until you tap Apply
              in the bar at the bottom.
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

            {whoOutPropagation && (
              <label className="edit-propagate">
                <input
                  type="checkbox"
                  checked={propagateDismissed}
                  onChange={(e) => setPropagateDismissed(e.target.checked)}
                />
                <span>
                  From the next ball, replace {pName(whoOutPropagation.removeId)}{" "}
                  with {pName(whoOutPropagation.stayId)} at the crease
                </span>
              </label>
            )}

            <div className="edit-crease-actions">
              <button
                type="button"
                className="hud-btn"
                disabled={busy || !form.strikerId || !form.nonStrikerId}
                onClick={() =>
                  setForm((f) =>
                    f
                      ? {
                          ...f,
                          strikerId: f.nonStrikerId,
                          nonStrikerId: f.strikerId,
                        }
                      : f,
                  )
                }
              >
                Swap striker / non-striker
              </button>
              <button
                type="button"
                className="hud-btn"
                disabled={busy}
                onClick={() => {
                  const d = editing;
                  if (d) openReplace(d);
                }}
              >
                Replace batter from this ball onward
              </button>
            </div>

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
                onClick={addBallToDraft}
              >
                Add to draft
              </button>
            </div>
          </PickerGroup>
        )}
      </HudModal>

      <HudModal
        open={!!replacing}
        title="Replace batter from this ball onward"
        onBackdropClick={closeReplace}
        onEscape={closeReplace}
      >
        {replacing && (
          <PickerGroup>
            {sheetError ? (
              <div className="error-banner mb-3" role="alert">
                {sheetError}
              </div>
            ) : null}
            <p className="mb-3 text-sm opacity-80">
              Replace one batter with another on the crease (striker and
              non-striker) from this ball through the rest of the innings.
              Retired not out and batters already at the crease are allowed.
            </p>
            <PickerField
              label="Batter to replace"
              value={replaceFrom}
              onChange={setReplaceFrom}
              options={batsmen.map((p) => ({ id: p.id, label: p.display_name }))}
              required
              disabled={busy}
            />
            <PickerField
              label="Replacement"
              value={replaceTo}
              onChange={setReplaceTo}
              options={batsmen.map((p) => ({ id: p.id, label: p.display_name }))}
              required
              disabled={busy}
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={closeReplace}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hud-btn primary flex-1 disabled:opacity-40"
                disabled={
                  busy || !replaceFrom || !replaceTo || replaceFrom === replaceTo
                }
                onClick={() =>
                  addReplaceToDraft({
                    delivery: replacing,
                    fromId: replaceFrom,
                    toId: replaceTo,
                  })
                }
              >
                Add replace to draft
              </button>
            </div>
          </PickerGroup>
        )}
      </HudModal>

      <HudModal
        open={previewOpen}
        title="Saved → Draft"
        onBackdropClick={() => setPreviewOpen(false)}
        panelClassName="hud-sheet-tall"
      >
        {diff && (
          <div className="edit-preview">
            {!diff.hasScoreChange && (
              <p className="mb-3 text-sm opacity-80">
                Balls changed; team total is the same.
              </p>
            )}
            <div className={`edit-diff-row${diff.result.changed ? " changed" : ""}`}>
              <span className="edit-diff-label">Result</span>
              <span className="edit-diff-values">
                <span className="edit-diff-from">{diff.result.before}</span>
                <span aria-hidden="true"> → </span>
                <span className="edit-diff-to">{diff.result.after}</span>
              </span>
            </div>
            {diff.innings.map((inn) => (
              <section key={inn.inningsId} className="edit-preview-inn">
                <h3>
                  Innings {inn.index} · {inn.battingName}
                </h3>
                <DiffLines rows={[inn.totals]} />
                <p className="section-title">Batting</p>
                <DiffLines
                  rows={inn.batting.filter((r) => r.changed || !r.before.includes("did not bat") || !r.after.includes("did not bat"))}
                />
                <p className="section-title">Bowling</p>
                <DiffLines rows={inn.bowling} />
                {inn.partnerships.some((r) => r.changed) && (
                  <>
                    <p className="section-title">Partnerships</p>
                    <DiffLines rows={inn.partnerships} onlyChanged />
                  </>
                )}
              </section>
            ))}
            <div className="flex gap-2 pt-3">
              <button
                type="button"
                className="hud-btn flex-1"
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="hud-btn primary flex-1 disabled:opacity-40"
                disabled={busy}
                onClick={() => void applyDraft()}
              >
                {busy ? "Saving…" : "Apply"}
              </button>
            </div>
          </div>
        )}
      </HudModal>

      {dirty && (
        <div
          className="edit-draft-dock no-print"
          role="region"
          aria-label="Unsaved draft"
        >
          <p className="edit-draft-count" aria-live="polite">
            {changeWord(ops.length)}
          </p>
          <div className="edit-draft-actions">
            <button
              type="button"
              className="hud-btn"
              disabled={busy}
              onClick={() => setPreviewOpen(true)}
            >
              Preview
            </button>
            <button
              type="button"
              className="hud-btn danger"
              disabled={busy}
              onClick={discardDraft}
            >
              Discard
            </button>
            <button
              type="button"
              className="hud-btn primary"
              disabled={busy}
              onClick={() => void applyDraft()}
            >
              {busy ? "Saving…" : "Apply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
