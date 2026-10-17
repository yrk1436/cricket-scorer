import { expect, test } from "@playwright/test";
import {
  QA_NAMES,
  applyDraft,
  assertOriginalUntouched,
  deliveriesFor,
  getBundle,
  inputFromDelivery,
  inningsFor,
  loadQaMatch,
  mintUnlockCookie,
  openUnlockedEditor,
  playerId,
  playersFor,
  supabaseAdmin,
} from "./helpers";

test.afterEach(async () => {
  await assertOriginalUntouched();
});

test("QA-13 wrong PIN is blocked on the public page", async ({ page }) => {
  const match = await loadQaMatch(QA_NAMES.ui);
  await page.goto(`/m/${match.publicId}`);
  await page.locator("header").getByRole("button", { name: "Edit match" }).click();
  await page.locator("#public-edit-pin").fill("zzzz-wrong-pin");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("Wrong PIN")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edit match" })).toHaveCount(1);
  await expect(page.getByText("Re-check innings")).toHaveCount(0);
});

test("QA-01/02/03 single-ball run, extras, bowler, striker, legal balls", async ({
  request,
}) => {
  const match = await loadQaMatch(QA_NAMES.ball);
  const before = await getBundle(request, match);
  const inn1 = before.innings.find((i) => i.index_num === 1)!;
  const dels = [...before.deliveriesByInningsId[inn1.id]].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const two = dels.find((d) => d.display_order === 3);
  if (!two || two.runs_off_bat !== 2) throw new Error("Expected 0.3 as a 2");
  const players = await playersFor(match.id);
  const sai = playerId(players, "Sai", "a");
  const varun = playerId(players, "Varun", "b");
  const manoj = playerId(players, "Manoj", "b");
  const rishiram = playerId(players, "Rishiram", "a");

  const runEdit = await applyDraft(request, match, [
    {
      kind: "ball",
      deliveryId: two.id,
      inningsId: inn1.id,
      input: inputFromDelivery(two, { runsOffBat: 4 }),
    },
  ]);
  expect(runEdit.status, JSON.stringify(runEdit.json)).toBe(200);

  const afterRun = await getBundle(request, match);
  const inn1After = afterRun.innings.find((i) => i.index_num === 1)!;
  expect(inn1After.runs).toBe(inn1.runs + 2);

  const wideSrc = dels.find((d) => d.display_order === 1)!;
  const extraEdit = await applyDraft(request, match, [
    {
      kind: "ball",
      deliveryId: wideSrc.id,
      inningsId: inn1.id,
      input: inputFromDelivery(wideSrc, {
        extraType: "wide",
        extraRuns: 1,
        runsOffBat: 0,
        bowlerId: manoj,
        strikerId: sai,
        nonStrikerId: rishiram,
      }),
    },
  ]);
  expect(extraEdit.status, JSON.stringify(extraEdit.json)).toBe(200);

  const after = await getBundle(request, match);
  const inn = after.innings.find((i) => i.index_num === 1)!;
  expect(inn.balls_legal).toBe(inn1After.balls_legal - 1);
  const edited = after.deliveriesByInningsId[inn1.id].find((d) => d.id === wideSrc.id)!;
  expect(edited.extra_wide).toBe(1);
  expect(edited.counts_as_legal_delivery).toBe(false);
  expect(edited.bowler_id).toBe(manoj);
  expect(edited.striker_id).toBe(sai);
  expect(edited.bowler_id).not.toBe(varun);
});

test("QA-05/06/08 Deepak-Roop replace, skip 7.0, Re-check one-tap", async ({
  page,
  request,
}) => {
  const match = await loadQaMatch(QA_NAMES.retirement);
  const players = await playersFor(match.id);
  const deepak = playerId(players, "Deepak", "a");
  const roop = playerId(players, "Roop", "a");
  const inns = await inningsFor(match.id);
  const inn1 = inns.find((i) => i.index_num === 1)!;
  const dels = await deliveriesFor(inn1.id);
  const ret = dels.find((d) => d.display_order === 51)!;
  expect(ret.dismissal).toBe("retired_hurt");
  expect(ret.striker_id).toBe(roop);
  expect(ret.non_striker_id).toBe(deepak);
  const ball72 = dels.find((d) => d.display_order === 53)!;

  await openUnlockedEditor(page, match);
  await expect(page.locator(".error-banner")).toHaveCount(0);
  await page.getByRole("button", { name: /Edit ball 7\.0 ret/ }).click();
  await expect(page.getByRole("heading", { name: "Edit ball" })).toBeVisible();
  await expect(page.getByText("Who is retiring?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Striker — Roop/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Non-striker — Deepak/ })).toBeVisible();

  await page.getByRole("button", { name: "Replace batter from this ball onward" }).click();
  await expect(page.getByRole("heading", { name: /Replace batter/ })).toBeVisible();
  await expect(page.locator(".error-banner")).toHaveCount(0);
  await page.getByRole("button", { name: "Add replace to draft" }).click();
  await expect(page.getByText(/Who is out \/ retiring must be the striker/)).toHaveCount(0);
  await expect(page.getByText(/unsaved change/i)).toBeVisible();

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Saved → Draft")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/unsaved change/i)).toHaveCount(0);

  const after = await getBundle(request, match);
  const later = after.deliveriesByInningsId[inn1.id];
  const retAfter = later.find((d) => d.display_order === 51)!;
  expect(retAfter.striker_id).toBe(roop);
  expect(retAfter.non_striker_id).toBe(deepak);
  expect(retAfter.dismissed_batsman_id).toBe(deepak);
  expect(retAfter.dismissal).toBe("retired_hurt");
  const d72 = later.find((d) => d.display_order === 53)!;
  expect(d72.striker_id).toBe(roop);
  expect(later.filter((d) => d.display_order >= 53).some((d) => d.striker_id === deepak || d.non_striker_id === deepak)).toBe(false);

  await page.getByRole("button", { name: "Re-check innings" }).click();
  await expect(page.getByText(/No retired or out batter is still batting later/)).toBeVisible();
});

test("QA-04 retirement who-retires propagation via API", async ({ request }) => {
  const match = await loadQaMatch(QA_NAMES.retirement);
  const players = await playersFor(match.id);
  const inns = await inningsFor(match.id);
  const inn1 = inns.find((i) => i.index_num === 1)!;
  const dels = await deliveriesFor(inn1.id);
  const advaithRet = dels.find((d) => d.display_order === 98);
  if (!advaithRet) throw new Error("missing Advaith retirement");
  const harish = playerId(players, "Harish", "a");
  const rishi = playerId(players, "Rishi", "a");
  const res = await applyDraft(request, match, [
    {
      kind: "ball",
      deliveryId: advaithRet.id,
      inningsId: inn1.id,
      input: inputFromDelivery(advaithRet, {
        isWicket: true,
        dismissal: "retired_hurt",
        dismissedBatsmanId: harish,
        incomingStrikerId: rishi,
        extraType: "none",
        extraRuns: 0,
        runsOffBat: 0,
      }),
      propagateDismissed: true,
    },
  ]);
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  const after = await getBundle(request, match);
  const next = after.deliveriesByInningsId[inn1.id].find((d) => d.display_order === 99)!;
  expect(next.non_striker_id).not.toBe(harish);
});

test("QA-09 stacked edits apply as one history line", async ({ request }) => {
  const match = await loadQaMatch(QA_NAMES.stack);
  const before = await getBundle(request, match);
  const inn1 = before.innings.find((i) => i.index_num === 1)!;
  const dels = [...before.deliveriesByInningsId[inn1.id]].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const a = dels.find((d) => d.display_order === 2)!;
  const b = dels.find((d) => d.display_order === 4)!;
  const histBefore = (
    await supabaseHistory(match.id)
  ).length;

  const res = await applyDraft(request, match, [
    {
      kind: "ball",
      deliveryId: a.id,
      inningsId: inn1.id,
      input: inputFromDelivery(a, { runsOffBat: 1 }),
    },
    {
      kind: "ball",
      deliveryId: b.id,
      inningsId: inn1.id,
      input: inputFromDelivery(b, { runsOffBat: 1 }),
    },
  ]);
  expect(res.status, JSON.stringify(res.json)).toBe(200);

  const hist = await supabaseHistory(match.id);
  expect(hist.length).toBe(histBefore + 1);
  const last = hist[hist.length - 1];
  expect(last.kind).toBe("session");
  expect(last.summary).toMatch(/2 ball edits/);
  expect(last.operations).toHaveLength(2);
});

test("QA-12 stale-write rejection on concurrent apply", async ({ request }) => {
  const match = await loadQaMatch(QA_NAMES.stale);
  const bundle = await getBundle(request, match);
  const inn1 = bundle.innings.find((i) => i.index_num === 1)!;
  const dels = [...bundle.deliveriesByInningsId[inn1.id]].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const first = dels.find((d) => d.display_order === 1)!;
  const second = dels.find((d) => d.display_order === 2)!;
  const stamp = bundle.match.updated_at;
  const ids: Record<string, string[]> = {};
  for (const [innId, list] of Object.entries(bundle.deliveriesByInningsId)) {
    ids[innId] = [...list]
      .sort((a, b) => a.display_order - b.display_order)
      .map((d) => d.id);
  }

  const cookie = mintUnlockCookie(match.id);
  const post = (deliveryId: string, runs: number) =>
    request.post(
      `/api/matches/write/${encodeURIComponent(match.writeToken)}/edit-draft`,
      {
        headers: { Cookie: `cric_match_unlock=${cookie}` },
        data: {
          expectedUpdatedAt: stamp,
          expectedDeliveryIdsByInningsId: ids,
          operations: [
            {
              kind: "ball",
              deliveryId,
              inningsId: inn1.id,
              input: inputFromDelivery(
                dels.find((d) => d.id === deliveryId)!,
                { runsOffBat: runs },
              ),
            },
          ],
        },
      },
    );

  const [a, b] = await Promise.all([post(first.id, 1), post(second.id, 1)]);
  const statuses = [a.status(), b.status()].sort();
  expect(statuses).toContain(200);
  expect(statuses).toContain(409);
  const failed = a.status() === 409 ? await a.json() : await b.json();
  expect(failed.error).toMatch(/changed|reload/i);
});

test("QA-14/15/16/17 validation, retired out text, chase result", async ({
  request,
  page,
}) => {
  const match = await loadQaMatch(QA_NAMES.validation);
  const before = await getBundle(request, match);
  const inn1 = before.innings.find((i) => i.index_num === 1)!;
  const inn2 = before.innings.find((i) => i.index_num === 2)!;
  const dels1 = [...before.deliveriesByInningsId[inn1.id]].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const dels2 = [...before.deliveriesByInningsId[inn2.id]].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const players = await playersFor(match.id);
  const deepak = playerId(players, "Deepak", "a");
  const ball = dels1.find((d) => d.display_order === 1)!;

  const samePerson = await applyDraft(request, match, [
    {
      kind: "ball",
      deliveryId: ball.id,
      inningsId: inn1.id,
      input: inputFromDelivery(ball, {
        strikerId: ball.striker_id,
        nonStrikerId: ball.striker_id,
      }),
    },
  ]);
  expect(samePerson.status).toBe(400);
  expect(samePerson.json.error).toMatch(/different people/i);

  const later = dels1.find((d) => d.display_order === 103)!;
  const outAgain = await applyDraft(request, match, [
    {
      kind: "ball",
      deliveryId: later.id,
      inningsId: inn1.id,
      input: inputFromDelivery(later, { strikerId: deepak }),
    },
  ]);
  expect(outAgain.status).toBe(400);
  expect(outAgain.json.error).toMatch(/out or retired out is still batting/i);

  const advaithRet = dels1.find((d) => d.display_order === 98)!;
  const retiredOut = await applyDraft(request, match, [
    {
      kind: "ball",
      deliveryId: advaithRet.id,
      inningsId: inn1.id,
      input: inputFromDelivery(advaithRet, {
        isWicket: true,
        dismissal: "retired_out",
        extraType: "none",
        extraRuns: 0,
        runsOffBat: 0,
        bowlerId: null,
      }),
    },
  ]);
  expect(retiredOut.status, JSON.stringify(retiredOut.json)).toBe(200);
  const afterRet = await getBundle(request, match);
  const inn1b = afterRet.innings.find((i) => i.index_num === 1)!;
  expect(inn1b.wickets).toBe(inn1.wickets + 1);
  expect(inn1b.balls_legal).toBe(inn1.balls_legal - (advaithRet.counts_as_legal_delivery ? 1 : 0));
  await page.goto(`/m/${match.publicId}`);
  await expect(page.getByText("retired out").first()).toBeVisible();
  await expect(page.getByText("retired not out").first()).toBeVisible();

  const chaseOne = dels2.find(
    (d) =>
      d.runs_off_bat === 1 &&
      d.counts_as_legal_delivery &&
      !d.is_wicket &&
      d.extra_wide === 0,
  );
  if (!chaseOne) throw new Error("no 1-run chase ball");
  const chase = await applyDraft(request, match, [
    {
      kind: "ball",
      deliveryId: chaseOne.id,
      inningsId: inn2.id,
      input: inputFromDelivery(chaseOne, { runsOffBat: 0 }),
    },
  ]);
  expect(chase.status, JSON.stringify(chase.json)).toBe(200);
  const afterChase = await getBundle(request, match);
  expect(afterChase.match.result_summary).not.toBe(before.match.result_summary);
});

test("QA-07/10/11 swap this ball, discard, unsaved warning", async ({ page, request }) => {
  const match = await loadQaMatch(QA_NAMES.ui);
  const before = await getBundle(request, match);
  const inn1 = before.innings.find((i) => i.index_num === 1)!;
  const first = before.deliveriesByInningsId[inn1.id].find((d) => d.display_order === 1)!;

  await openUnlockedEditor(page, match);
  await page.getByRole("button", { name: "Edit ball 0.1, Achyuth" }).click();
  const strikerBefore = first.striker_id;
  const nsBefore = first.non_striker_id;
  await page.getByRole("button", { name: "Swap striker / non-striker" }).click();
  await page.getByRole("button", { name: "Add to draft" }).click();
  await expect(page.getByText(/unsaved change/i)).toBeVisible();

  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Edit match" })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText(/unsaved change/i)).toHaveCount(0);

  const after = await getBundle(request, match);
  const saved = after.deliveriesByInningsId[inn1.id].find((d) => d.id === first.id)!;
  expect(saved.striker_id).toBe(strikerBefore);
  expect(saved.non_striker_id).toBe(nsBefore);
});

test("QA-18 mobile sticky bar and sheets at 390px", async ({ page }) => {
  const match = await loadQaMatch(QA_NAMES.ui);
  await page.setViewportSize({ width: 390, height: 844 });
  await openUnlockedEditor(page, match);
  await page.getByRole("button", { name: "Edit ball 0.1, Achyuth" }).click();
  await page.locator(".run-pick-btn", { hasText: /^4$/ }).click();
  await page.getByRole("button", { name: "Add to draft" }).click();
  const dock = page.locator(".edit-draft-dock");
  await expect(dock).toBeVisible();
  const box = await dock.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1);
  await page.getByRole("button", { name: "Preview" }).click();
  const sheet = page.locator(".hud-sheet, [role='dialog']").last();
  await expect(sheet).toBeVisible();
  const sheetBox = await sheet.boundingBox();
  expect(sheetBox!.width).toBeLessThanOrEqual(390);
});

async function supabaseHistory(matchId: string) {
  const { data, error } = await supabaseAdmin()
    .from("matches")
    .select("edit_history")
    .eq("id", matchId)
    .single();
  if (error) throw new Error(error.message);
  return (data.edit_history ?? []) as {
    kind?: string;
    summary?: string;
    operations?: unknown[];
  }[];
}
