import { test } from "node:test";
import assert from "node:assert/strict";
import { Coach, COOLDOWN_MS } from "./coach.ts";
import type { Step, Verdict } from "../../shared/contracts.ts";

const step = (id: number, irreversible = false): Step => ({
  id, start_s: id * 10, end_s: id * 10 + 10, instruction: `do ${id}`, expected_end_state: "ok",
  irreversible, timer_s: null, quantities: [], common_mistakes: [],
});
const v = (status: Verdict["status"], message = "msg"): Verdict => ({ status, message, object_to_highlight: "bowl" });
const said = (msgs: { type: string }[]) => msgs.filter((m) => m.type === "say").length;

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

test("step_done asks once, the user confirms to advance", () => {
  const c = new Coach({ title: "t", steps: [step(0), step(1)] });
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
