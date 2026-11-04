import { test } from "node:test";
import assert from "node:assert/strict";
import { Coach, COOLDOWN_MS } from "./coach.ts";
import { cleanVerdict, isOcclusionMessage } from "./judge.ts";
import type { Step, Verdict } from "../../shared/contracts.ts";

const step = (id: number, irreversible = false): Step => ({
  id, start_s: id * 10, end_s: id * 10 + 10, instruction: `do ${id}`, expected_end_state: "ok", reference_s: id * 10 + 9,
  irreversible, timer_s: null, quantities: [], common_mistakes: [],
});

const v = (status: Verdict["status"], message = "msg", object_to_highlight: string | null = "bowl"): Verdict => ({
  status, message, object_to_highlight,
});

const said = (msgs: { type: string }[]) => msgs.filter((m) => m.type === "say").length;
const hasType = (msgs: { type: string }[], type: string) => msgs.some((m) => m.type === type);

// ============================================================================
// ORIGINAL BASELINE TESTS (Preserved)
// ============================================================================

test("speaks only after 2 deviations in a row, then respects the cooldown", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] });
  c.start();
  assert.equal(said(c.onVerdict(v("deviation"), 0, 1)), 0);
  const second = c.onVerdict(v("deviation"), 1, 1);
  assert.equal(said(second), 1);
  assert.ok(second.some((m) => m.type === "highlight"));
  c.onVerdict(v("deviation"), 2, 1);
  assert.equal(said(c.onVerdict(v("deviation"), 3, 1)), 0, "cooldown");
  // the deviation persisted through the cooldown: spoken as soon as it ends
  assert.equal(said(c.onVerdict(v("deviation"), COOLDOWN_MS + 1, 1)), 1);
});

test("an on_track verdict resets the deviation count", () => {
  const c = new Coach({ title: "t", steps: [step(0)] });
  c.onVerdict(v("deviation"), 0, 1);
  c.onVerdict(v("on_track"), 1, 1);
  assert.equal(said(c.onVerdict(v("deviation"), 2, 1)), 0);
});

test("manual mode: step_done asks once, the user confirms to advance", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] }, { autoAdvance: false });
  assert.equal(said(c.onVerdict(v("step_done"), 0, 1)), 1);
  assert.equal(said(c.onVerdict(v("step_done"), COOLDOWN_MS * 2, 1)), 0);
  c.onCommand("done");
  assert.equal(c.index, 1);
});

test("guards an irreversible next step after a deviation", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1, true)] });
  c.onVerdict(v("deviation", "whites not stiff"), 0, 1);
  const warn = c.onCommand("next");
  assert.equal(c.index, 0);
  assert.match((warn[0] as { text: string }).text, /whites not stiff/);
  c.onCommand("next");
  assert.equal(c.index, 1);
});

test("finishes after the last step, back and repeat stay in range", () => {
  const c = new Coach({ title: "t", steps: [step(0)] });
  c.onCommand("back");
  assert.equal(c.index, 0);
  assert.ok(c.onCommand("next").some((m) => m.type === "finished"));
});

// ============================================================================
// PRIORITY 5: 10 FOCUSED AUTOMATED TESTS
// ============================================================================

// 1. Temporary hand obstruction
test("1. Temporary hand obstruction: handled as unsure, does not trigger deviation or repeat warnings", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] });
  c.start();

  // Test sanitization: if the model flagged a false deviation due to hands blocking the bowl
  const rawOcclusion = v("deviation", "Move your hands so I can see inside the bowl");
  assert.ok(isOcclusionMessage(rawOcclusion.message));
  const cleaned = cleanVerdict(rawOcclusion);
  assert.equal(cleaned.status, "unsure");
  assert.equal(cleaned.object_to_highlight, null);

  // Normal hand movement reported as unsure does NOT increment deviations or speak
  const out1 = c.onVerdict(cleaned, 0, 1);
  assert.equal(said(out1), 0);
  assert.equal(hasType(out1, "highlight"), false);

  // Another unsure verdict does not nag or repeat warnings during active hand movement
  const out2 = c.onVerdict(v("unsure", "Work is temporarily occluded"), 1000, 1);
  assert.equal(said(out2), 0);

  // A prior deviation is preserved through 1 temporary obstruction frame
  c.onVerdict(v("deviation", "wrong fold"), 2000, 1); // count = 1
  c.onVerdict(v("unsure"), 3000, 1); // hand passes by; should NOT wipe the pending deviation
  const out3 = c.onVerdict(v("deviation", "wrong fold"), 4000, 1); // count = 2 -> confirmed!
  assert.equal(said(out3), 1);
  assert.equal(c.index, 0); // did not move
});

// 2. Genuine deviation
test("2. Genuine deviation: speaks urgent warning after 2 confirmed deviations and respects cooldown", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] });
  c.start();

  // First deviation: quiet observation
  const out1 = c.onVerdict(v("deviation", "Cut along the dashed line, not solid line"), 0, 1);
  assert.equal(said(out1), 0);

  // Second deviation: confirmed! Speaks urgent line and highlights object
  const out2 = c.onVerdict(v("deviation", "Cut along the dashed line, not solid line"), 1000, 1);
  assert.equal(said(out2), 1);
  assert.ok(out2.some((m) => m.type === "say" && m.urgent));
  assert.ok(out2.some((m) => m.type === "highlight"));

  // Third deviation within cooldown: suppressed
  const out3 = c.onVerdict(v("deviation", "Cut along the dashed line, not solid line"), 2000, 1);
  assert.equal(said(out3), 0);
});

// 3. Incomplete step
test("3. Incomplete step: on_track work in progress does not advance and resets done confirmation", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] });
  c.start();

  // User is actively whisking / folding
  const out1 = c.onVerdict(v("on_track", "User is folding the top corner"), 0, 1);
  assert.equal(said(out1), 0);
  assert.equal(c.index, 0);
  assert.equal(hasType(out1, "step"), false);

  // Progress was recorded in lightweight memory
  assert.ok(c.getProgressSummary().includes("User is folding the top corner"));

  // Even after multiple on_track checks, step never advances prematurely
  const out2 = c.onVerdict(v("on_track", "Corner is aligned, making crease"), 4000, 1);
  assert.equal(said(out2), 0);
  assert.equal(c.index, 0);
});

// 4. Confirmed step completion
test("4. Confirmed step completion: 2 independent checks confirm completion, announces step complete, advances automatically", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] });
  c.start();
  assert.equal(c.index, 0);

  // Check 1: step_done (first observation, not yet confirmed)
  const out1 = c.onVerdict(v("step_done", "Fold complete and sharp"), 0, 1);
  assert.equal(said(out1), 0, "Does not advance on single observation");
  assert.equal(c.index, 0);

  // Check 2: step_done (independent second check confirms completion!)
  const out2 = c.onVerdict(v("step_done", "Fold complete and sharp"), 4000, 1);
  assert.equal(c.index, 1, "Automatically advanced to step 1");
  assert.ok(out2.some((m) => m.type === "say" && m.text === "Step complete!"));
  assert.ok(out2.some((m) => m.type === "step" && m.index === 1));
  assert.ok(out2.some((m) => m.type === "say" && m.text.startsWith("Step 2. do 1")));
});

// 5. False positive step_done
test("5. False positive step_done: single ambiguous step_done followed by on_track does not advance", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] });
  c.start();

  // Check 1: single ambiguous step_done
  c.onVerdict(v("step_done", "Looks folded"), 0, 1);
  assert.equal(c.index, 0);

  // Check 2: user is still working (on_track)
  c.onVerdict(v("on_track", "Still smoothing crease"), 4000, 1);
  assert.equal(c.index, 0);

  // Check 3: another single step_done arrives later - requires 2 checks again
  const out3 = c.onVerdict(v("step_done", "Looks folded"), 8000, 1);
  assert.equal(c.index, 0, "Still does not advance because on_track reset the confirmation count");
});

// 6. Duplicate completion responses
test("6. Duplicate completion responses: extra step_done verdicts do not advance twice", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1), step(2)] });
  c.start();

  // Confirm step 0
  c.onVerdict(v("step_done"), 0, 1);
  const out = c.onVerdict(v("step_done"), 4000, 1);
  assert.equal(c.index, 1);
  assert.ok(hasType(out, "step"));

  // Stale or duplicate step_done from the previous step arrives immediately
  const dup = c.onVerdict(v("step_done"), 4100, 1);
  // It should NOT advance to step 2 on a duplicate completion!
  assert.equal(c.index, 1);
  assert.equal(hasType(dup, "step"), false);
});

// 7. Stale model responses
test("7. Stale model responses: responses from previous steps are safely ignored", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] });
  c.start();
  assert.equal(c.index, 0);

  // User manually presses next before an asynchronous check completes
  c.onCommand("next");
  assert.equal(c.index, 1);

  // Old step's stale check finishes
  // In session.ts, `if (this.coach.index !== index) return;` drops the check.
  // And in Coach, the step is at index 1 with clean state:
  const stale = c.onVerdict(v("deviation", "old step mistake"), 5000, 1);
  // Should not trigger urgent warning because deviations counter was reset for step 1
  assert.equal(said(stale), 0);
});

// 8. Progress-memory reset
test("8. Progress-memory reset: memory resets cleanly when transitioning to a new step", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] });
  c.start();

  // Accumulate observations on step 0
  c.onVerdict(v("on_track", "Folded left flap"), 0, 1);
  c.onVerdict(v("on_track", "Folded right flap"), 4000, 1);
  assert.equal(c.getProgressSummary().length, 2);

  // Advance to step 1
  c.onCommand("next");
  assert.equal(c.index, 1);

  // Step 1 must have completely fresh progress memory
  assert.deepEqual(c.getProgressSummary(), []);
});

// 9. Successful automatic advancement
test("9. Successful automatic advancement: hands-free progression through multiple tutorial steps", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1), step(2)] });
  c.start();
  assert.equal(c.index, 0);

  // Step 0: work then complete
  c.onVerdict(v("on_track", "working"), 0, 1);
  c.onVerdict(v("step_done", "done 0"), 4000, 1);
  c.onVerdict(v("step_done", "done 0"), 8000, 1);
  assert.equal(c.index, 1, "Advanced to step 1");

  // Step 1: work then complete
  c.onVerdict(v("on_track", "working 1"), 12000, 1);
  c.onVerdict(v("step_done", "done 1"), 16000, 1);
  c.onVerdict(v("step_done", "done 1"), 20000, 1);
  assert.equal(c.index, 2, "Advanced to step 2");
});

// 10. Final tutorial completion
test("10. Final tutorial completion: completes the final step and emits finished", () => {
  const c = new Coach({ title: "t", steps: [step(0)] });
  c.start();
  assert.equal(c.index, 0);

  // Check 1: step_done
  c.onVerdict(v("step_done"), 0, 1);
  assert.equal(c.index, 0);

  // Check 2: confirmed final step completion!
  const out = c.onVerdict(v("step_done"), 4000, 1);
  assert.ok(out.some((m) => m.type === "say" && m.text.includes("Well done!")));
  assert.ok(hasType(out, "finished"));
  assert.equal(c.index, 0, "Index stays within tutorial bounds");

  // Subsequent verdicts do not emit duplicate finished
  const dup = c.onVerdict(v("step_done"), 8000, 1);
  assert.equal(hasType(dup, "finished"), false);
});

// ============================================================================
// ADDITIONAL SAFETY TESTS
// ============================================================================

test("Irreversible step: requires explicit voice/manual confirmation before advancing", () => {
  // Step 1 is irreversible
  const c = new Coach({ title: "t", steps: [step(0), step(1, true)] });
  c.start();

  // Even with 2 step_done verdicts, irreversible next step prevents silent auto-advancement
  const out1 = c.onVerdict(v("step_done"), 0, 1);
  assert.ok(out1.some((m) => m.type === "say" && m.text.includes("can't be undone")));
  assert.equal(c.index, 0, "Must not auto-advance into irreversible step");

  const out2 = c.onVerdict(v("step_done"), 4000, 1);
  assert.equal(c.index, 0, "Must not auto-advance into irreversible step");
  assert.equal(said(out2), 0, "Does not repeat prompt within cooldown");

  // User explicitly says "done" -> advances
  c.onCommand("done");
  assert.equal(c.index, 1);
});

test("Visual completion uncertain: prompts voice confirmation when single step_done followed by uncertainty", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] });
  c.start();

  // 1 step_done followed by unsure (camera view uncertain)
  c.onVerdict(v("step_done"), 0, 1);
  const out = c.onVerdict(v("unsure"), 4000, 1);
  assert.ok(out.some((m) => m.type === "say" && m.text === "Looks done. Say done to go on."));
  assert.equal(c.index, 0);

  // User confirms via voice "done"
  c.onCommand("done");
  assert.equal(c.index, 1);
});
