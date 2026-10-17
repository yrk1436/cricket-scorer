# Edit match QA

Automated against **TEST copies only** of
`e0691e40-68ae-4ffb-a4fa-1f85a9a3e744` (Samosa Strikers vs Chai Chargers).
The original match is never written.

Copies reuse the original PIN hash. Unlock in the app with the same PIN as
the real match. Playwright mints the unlock cookie from `MATCH_UNLOCK_SECRET`
so it does not need the plaintext PIN.

## Recreate copies

```bash
node scripts/duplicate-match.mjs --preset qa
# wipe TEST QA copies and make fresh ones:
node scripts/duplicate-match.mjs --preset qa --reset
```

Names start with `TEST - Edit QA`. Public ids (keep these):

| Copy | public_id |
| --- | --- |
| QA 1 Ball extras | `37934d70-68d1-47d4-8b41-39a972524948` |
| QA 2 Retirement Deepak-Roop | `5b198285-9bb2-4bd0-b958-950937b1d363` |
| QA 3 Stack apply history | `167af79c-5b9d-4527-b057-895b79434e98` |
| QA 4 Discard PIN mobile | `44e73903-7ba8-4be5-a31b-117946111190` |
| QA 5 Stale write | `77e417e9-e951-433e-93cc-8057f5bd1fdc` |
| QA 6 Validation scorecard chase | `d1397471-8408-4f1f-b118-8c88c3cb1b49` |

`e2e/.qa-matches.json` is gitignored and has no write tokens.

## How to run

```bash
npm test                 # existing unit tests
npx playwright test      # this suite (needs .env.local + local Next server)
```

`playwright.config.ts` starts `npm start` on port 3000 if nothing is listening.

## Cases

| ID | Group | Copy | What to check |
| --- | --- | --- | --- |
| QA-01 | Ball edit | QA 1 | Change a single-ball run; totals, batter figures, and result recompute |
| QA-02 | Ball edit | QA 1 | Change extras / bowler / striker on one ball; figures follow |
| QA-03 | Extras | QA 1 | Wide or no-ball change updates legal-ball count |
| QA-04 | Retirement | QA 2 | Change who retires and later crease names follow |
| QA-05 | Deepak/Roop | QA 2 | 7.0 retired not out Deepak (striker Roop, NS Deepak); replace Deepak→Roop from that sheet; 7.0 stays; 7.2+ is Roop; no “who is out must be striker/NS” error |
| QA-06 | Replace | QA 2 | Replace batter from this ball onward (non-retirement start) |
| QA-07 | Swap | QA 4 | Swap striker / non-striker on **this ball only** |
| QA-08 | Re-check | QA 2 | Re-check flags Deepak still batting; one-tap fix clears it |
| QA-09 | Stack / Apply | QA 3 | Two stacked edits, one Apply, one session history line |
| QA-10 | Discard | QA 4 | Discard throws away the draft; saved balls unchanged |
| QA-11 | Unsaved | QA 4 | Done with a dirty draft asks before leaving |
| QA-12 | Stale | QA 5 | Two concurrent Applies; second is rejected (409) |
| QA-13 | PIN | QA 4 | Wrong PIN is blocked on the public page |
| QA-14 | Validation | QA 6 | Same person as striker and non-striker is blocked |
| QA-15 | Validation | QA 6 | An out batter set batting again is blocked |
| QA-16 | Retired out | QA 6 | Retired out is a team wicket only; scorecard says `retired out` / `retired not out` |
| QA-17 | Chase | QA 6 | Editing a chase ball can change the result summary |
| QA-18 | Mobile | QA 4 | ~390px: sticky draft bar and sheets stay on screen |

## Safety

- Script refuses names that do not start with `TEST -`.
- Script refuses to update or delete
  `e0691e40-68ae-4ffb-a4fa-1f85a9a3e744`.
- `--reset` deletes only rows whose `team_a_name` starts with `TEST - Edit QA`.
