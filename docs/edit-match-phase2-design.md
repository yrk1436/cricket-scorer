# Edit match — Phase 2 design

**Status:** planning only (no implementation in this commit)  
**Builds on:** Phase 1 on PR #6 (PIN-gated Edit match, per-ball save, `swapBattersFromDelivery` already in code)

## Short summary

Today, each ball save writes to the database immediately. Phase 2 changes that: the scorer stacks corrections (single-ball edits and “swap these two batters from this ball onward”) in an **unsaved draft**. The app **rebuilds the whole match from that draft** and shows a **before/after preview**. Nothing is stored until they tap **Apply** (one save + one history line) or **Discard**. Same PIN as today. No adding or deleting balls. No extra reviewers.

**Recommendation:** ship Phase 1 and Phase 2 together from this preview PR. Do not merge Phase 1 to production first — its “save every tap” behaviour would change again a week later.

---

## 1. Goals and non-goals

### Goals

- Let a scorer fix several mistakes, **see the new scorecard**, then commit once.
- Add **swap batters from this ball onward** (names were recorded on the wrong ends, or two batters were swapped mid-innings).
- Keep **one source of truth**: the ball list. Totals, batting, bowling, partnerships, live scorecard, and result are always recalculated from that list.
- Keep the **existing PIN**. Completed matches still need it; live matches still use the secret scoring link.
- Mobile-first, same look as today’s scorer.

### Non-goals (not in Phase 2)

- Insert or delete balls.
- Multi-captain / second-person review.
- Revert of an already-applied save (history is a log, not an undo stack).
- New login accounts or a new password system.
- Changing who is in the squad, or match settings, from this screen.
- Auto-saving the draft to the server (refresh or closing the tab without Apply discards it, after a warning).

---

## 2. Who this is for

The **scorer** who already has the match PIN (or the live scoring link). Viewers of the public share link still see the last **saved** scorecard until Apply.

---

## 3. User flows (mobile-first)

### 3.1 Enter Edit match

Same as Phase 1:

1. Completed public page `/m/…` → **Edit match** → enter PIN → edit mode.  
2. Or secret `/score/…` link → **Edit match** (PIN if the match is finished).

### 3.2 Fix one ball (into the draft)

1. Tap a ball in the over list.  
2. Change striker, non-striker, bowler, runs, extras, or wicket/retirement.  
3. Tap **Add to draft** (replaces today’s immediate **Save correction**).  
4. Sheet closes. That ball is marked as changed. A **draft banner** appears: “1 unsaved change”.  
5. Score figures on screen now follow the **draft**, not the last save.

### 3.3 Swap two batters from this ball onward

1. On a ball row, tap **Swap batters**.  
2. Sheet: “From 2.3 onward, swap these two.” Default pair = striker and non-striker on that ball. Either can be changed to another batter on the batting side.  
3. Confirm. The app runs the existing `swapBattersFromDelivery` helper: from that ball forward, those two names swap wherever they appear as striker, non-striker, dismissed, or incoming. Earlier balls stay as they were.  
4. That counts as one stacked edit. Banner: “2 unsaved changes”.

### 3.4 Review, then Apply or Discard

1. Tap **Preview** (always available while a draft exists).  
2. See **before (saved)** vs **after (draft)** for team totals, result, batting lines, bowling lines, and partnerships. Changed rows are highlighted.  
3. **Apply** writes everything in one go and adds one history line. Banner clears. Public scorecard updates.  
4. **Discard** throws away the draft and puts the last saved balls back on screen.

They can keep stacking (more ball edits, more swaps) before Apply. Order is the order they confirmed each sheet.

### 3.5 Leave with unsaved work

- **Done** or the browser back button while a draft exists → confirm: “Discard 2 unsaved changes?”  
- Refresh or closing the tab: same warning (`beforeunload`). There is no server-side draft to come back to.

---

## 4. Screens and states

Phone column (~390px), existing dark glass theme.

```
┌─────────────────────────────────┐
│ ← Done     Edit match           │
│ Samosa Strikers vs Chai Chargers│
├─────────────────────────────────┤
│ DRAFT BANNER (only if dirty)    │
│ 2 unsaved changes               │
│ [Preview]  [Apply]  [Discard]   │
├─────────────────────────────────┤
│ Innings 1 · 91/7 (20.0)  *draft │
│ Over 3                          │
│ 2.3  Ali · Kumar          1  ›  │
│      NS Raj                     │
│      [Swap batters]   • changed │
│ 2.4  …                          │
└─────────────────────────────────┘
```

**Ball editor sheet** — same fields as Phase 1; primary action is **Add to draft**, not save.

**Swap sheet** — two batter pickers, short explanation, **Add swap to draft**.

**Preview sheet** (full-height bottom sheet):

```
Saved → Draft
Result   A won by 1 run  →  B won chasing
Inns 1   91/7            →  92/7
Ali      12 (10)         →  16 (11)   highlighted
Raj      20 (18)         →  16 (17)   highlighted
Partnerships             →  changed rows only
```

| State | What they see |
| --- | --- |
| No draft | No banner. Apply/Discard hidden. Preview disabled. |
| Draft with changes | Banner + Apply / Discard / Preview. Changed balls get a small “changed” mark. Innings totals show a draft hint. |
| Preview, no material score change | “Balls changed; team total is the same.” Apply still allowed. |
| Apply in progress | Buttons disabled, “Saving…”. |
| Apply failed | Banner stays; error text; draft kept. |
| Discard confirm | “Throw away 2 unsaved changes?” |
| Empty innings | “No balls yet.” Swap and ball tap disabled. |
| Special rows (strike swap / crease replace) | Shown, not tappable, not swappable. |
| Leave with draft | Confirm dialog. |

Diff highlighting: use the existing green (up) / muted (unchanged) / amber (changed) tokens; never colour-only — also show the old and new numbers.

---

## 5. Data model

### Draft (client only)

Held in the phone’s memory while Edit match is open. Not a database table.

- **Base:** last saved ball list from the server.  
- **Draft balls:** a copy of that list, with stacked edits applied.  
- **Operations:** a short list of what they did, for the banner and the history line, e.g. “ball 2.3: runs 1 → 2”, “from 4.1 swap Ali ↔ Raj”.

The on-screen scorecard and the preview always run the same **recompute** function on the draft balls.

Why not store the draft on the server? This app has no user accounts, one PIN, and one scorer. A server draft would add tables, cleanup, and “whose draft?” without helping the main job. Trade-off: a refresh loses unsaved work — we warn first.

### What gets saved on Apply

One request, one transaction:

1. Every **changed** ball row is updated (same columns as today). Unchanged balls are left alone.  
2. All innings totals and the match result are rewritten from the new ball list.  
3. **One** `edit_history` line is appended.

Balls are never inserted or deleted. Count and order stay the same.

### Edit history (compatible with Phase 1)

Phase 1 already stores a list on the match. Each old line is one ball. Phase 2 adds a **session** line so one Apply is one story:

```text
when:  16 Oct 2026, 2:04pm
who:   Scorer (PIN unlocked)
what:  2 ball edits, 1 batter swap
       • 2.3  Ali runs 1 → 2
       • 4.1  swap Ali ↔ Raj from here onward
       • 5.2  bowler Kumar → Lee
```

Older single-ball lines still display in the existing history list. No revert button (still out of scope).

### If two people edit at once

Rare (one PIN, one scorer), but we do not silently overwrite.

- Apply sends the match’s last `updated_at` (a timestamp the server already maintains).  
- If live scoring or another Apply happened in between, the server **rejects** the save: “This match changed. Reload and try again.”  
- The draft stays on screen so they can copy what they meant to do; they must reload to get the new base.

We do **not** merge two drafts automatically.

---

## 6. How the numbers are rebuilt

The ball list is the source of truth. Everything else is derived.

Already in the app (Phase 1):

- `applyDeliveryEdit` — one ball, in memory  
- `swapBattersFromDelivery` — two names from a chosen ball onward  
- `derivedMatchState` — innings totals + result  
- `computeInningsScorecard` — batting, bowling, extras, fall of wickets, partnerships  

Phase 2 only **composes** those:

1. Start from the saved list.  
2. Replay each stacked operation onto a copy.  
3. Run `derivedMatchState` + scorecard on **saved** and on **draft**.  
4. Diff the two scorecards for the preview.  
5. On Apply, send the final draft balls; the server validates, writes, then runs the same recompute to persist totals.

The server must not invent a second scoring ruleset. If validation fails, nothing is written.

---

## 7. Saving as one piece (Supabase)

Phase 1 writes one ball, then history, then totals — three steps. A crash in the middle can leave a ball saved without a new result.

Phase 2 **Apply** should be **one database transaction**:

- Preferred: a single Postgres function (e.g. `apply_match_edit`) that updates the changed deliveries, appends one history line, and lets the existing recompute write innings + result — all commit or all roll back.  
- Acceptable: the Next.js server opens one transaction via a Supabase RPC that does the same.

PIN cookie is checked first, same as today. Live matches may still auto-finish a chase **after** a successful Apply if the new totals decide the game (same as today’s live-edit behaviour).

---

## 8. Validation (block Add to draft / Apply)

Shown as a plain sentence on the sheet; do not write a bad draft.

| Rule | Why |
| --- | --- |
| Striker and non-striker must be different people | Two names at the crease |
| Both batters on the batting side; bowler on the bowling side | Team mix-up |
| Bowler required unless the event is a retirement | Retirements are not a ball |
| Who is out / retiring must be the striker or non-striker | |
| Incoming batter cannot already be at the crease, and cannot be the person leaving | |
| A batter who is **out** (including retired out) cannot appear again as striker, non-striker, or incoming | They are finished |
| **Retired not out** may come back later | Existing product rule |
| Retirements are not a legal ball; retired out is a team wicket only | Existing product rule |
| Caught / stumped / run out need a fielder | Same as scoring pad |
| Swap: two different batting-side players; start ball must be a real scoring ball (not strike-swap / crease-replace) | |
| No insert or delete; Apply payload must have the same ball ids and order as saved | Tamper / bug guard |
| Cannot edit special rows | Strike-swap and crease-replace stay informational |

The server repeats these checks. The client never “wins” a disagreement.

---

## 9. Accessibility

- **Edit match**, **Add to draft**, **Swap batters**, **Apply**, **Discard**, **Preview** are real buttons, at least 44px tall.  
- Sheets are dialogs (`role="dialog"`, labelled title, focus moves in, Escape closes if no unsaved field edits).  
- Confirm dialogs for Discard and for leaving with a draft.  
- Diffs show old and new values as text, not only colour.  
- PIN field stays `type="password"`, not stored in the draft.  
- `aria-live` on the banner when the change count updates.  
- Reduced-motion: no reliance on animation to notice a change (the “changed” mark is enough).

---

## 10. Test plan

### Automated (must pass before preview)

- Existing Phase 1 recompute tests stay green.  
- **Swap:** from ball N, only N and later IDs flip; earlier balls unchanged; scorecard runs move with the names.  
- **Stacking:** ball edit then swap (and the reverse) matches applying both to a copy of the list.  
- **Diff:** changing 1 → 2 on one ball highlights that batter, team total, and result if it flips; unchanged bowlers stay quiet.  
- **Validation:** same person as striker and non-striker rejected; dismissed batter cannot return; retired not out can.  
- **Apply payload:** same number of balls, same ids; server rejects a missing/extra id.  
- **Concurrency:** Apply with a stale `updated_at` is rejected and does not write.  
- `npm run build` stays green.

### Manual QA (preview, do not use a prized live final unless you mean to)

1. Completed match, public `/m/…` → PIN → Edit match.  
2. Change one ball’s runs → banner “1 unsaved change” → Preview shows new total → **Discard** → original numbers.  
3. Same change → **Apply** → public scorecard and history show one session line.  
4. Swap striker/non-striker from mid-innings → later balls follow; earlier do not → Preview → Apply.  
5. Stack: runs fix + swap + bowler fix → one Apply, one history line.  
6. Wrong PIN still blocked. Live match: Edit match without PIN, draft still does not write until Apply.  
7. Tap **Done** with a draft → confirm, then discard.  
8. Try Apply after scoring a new ball in another tab → “match changed”, draft kept.  
9. Retirement still not a ball; retired out is a wicket; scorecard text “retired not out” / “retired out”.  
10. Phone width: banner, sheets, and Apply stay usable with one thumb.

---

## 11. Rollout

| Option | Verdict |
| --- | --- |
| Merge Phase 1 to production now, Phase 2 later | **No.** Scorers would learn “every tap saves”, then we change it. |
| Keep both on this preview PR, merge once | **Yes.** One story: PIN → draft → preview → Apply. |
| Separate Phase 2 PR on top of Phase 1, still preview-only until both land | Acceptable if the PR gets too large, but **do not** promote Phase 1 alone. |

**Sequence**

1. This design, reviewed.  
2. Implement on `cursor/edit-match-corrections-d75c` (or a follow-up branch stacked on it).  
3. Preview QA with the checklist above.  
4. One production merge when preview is signed off.

Phase 1’s immediate save becomes **Add to draft** in the same screens. No parallel “old save” path after Phase 2 lands.

---

## 12. What we will not invent later in this phase

If a later phase wants server-side drafts, revert, or insert/delete, the ball list + pure recompute stay the same. Those features would add storage and UI on top — they should not rewrite how a score is calculated.
