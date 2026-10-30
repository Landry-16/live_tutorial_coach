// Session state machine: decides when the coach speaks. Pure, no I/O, so it is unit tested.
import type { Command, ServerMsg, Step, Tutorial, Verdict } from "../../shared/contracts.ts";

export const DEVIATIONS_BEFORE_SPEAKING = 2;
export const COOLDOWN_MS = 15_000;

export class Coach {
  index = 0;
  private deviations = 0;
  private lastSpokeAt = -Infinity;
  private askedDone = false;
  private overrideArmed = false;
  private lastVerdict: Verdict | null = null;

  constructor(readonly tutorial: Tutorial) {}

  get step(): Step {
    return this.tutorial.steps[this.index];
  }

  get nextStep(): Step | undefined {
    return this.tutorial.steps[this.index + 1];
  }

  start(): ServerMsg[] {
    return this.enterStep(this.index);
  }

  onVerdict(v: Verdict, now: number, ms: number): ServerMsg[] {
    this.lastVerdict = v;
    const out: ServerMsg[] = [{ type: "verdict", verdict: v, ms }];
    const cooledDown = now - this.lastSpokeAt >= COOLDOWN_MS;

    if (v.status !== "deviation") this.deviations = 0;

    if (v.status === "deviation" && ++this.deviations >= DEVIATIONS_BEFORE_SPEAKING && cooledDown) {
      this.deviations = 0;
      this.lastSpokeAt = now;
      out.push({ type: "say", text: v.message, urgent: true });
      if (v.object_to_highlight) out.push({ type: "highlight", label: v.object_to_highlight, box: null });
    } else if (v.status === "step_done" && !this.askedDone && cooledDown) {
      this.askedDone = true;
      this.lastSpokeAt = now;
      out.push({ type: "say", text: "Looks done. Say done to go on.", urgent: false });
    }
    return out;
  }

  onCommand(cmd: Command): ServerMsg[] {
    if (cmd === "repeat") return this.enterStep(this.index);
    if (cmd === "back") return this.enterStep(Math.max(0, this.index - 1));

    // Point of no return: the next step cannot be undone and the last check saw a problem.
    const risky = this.nextStep?.irreversible && this.lastVerdict?.status === "deviation";
    if (risky && !this.overrideArmed) {
      this.overrideArmed = true;
      return [{
        type: "say",
        text: `Wait, the next step can't be undone. ${this.lastVerdict!.message} Say next again to continue anyway.`,
        urgent: true,
      }];
    }
    if (!this.nextStep) return [{ type: "say", text: "That was the last step. Well done!", urgent: false }, { type: "finished" }];
    return this.enterStep(this.index + 1);
  }

  private enterStep(i: number): ServerMsg[] {
    this.index = i;
    this.deviations = 0;
    this.askedDone = false;
    this.overrideArmed = false;
    this.lastVerdict = null;
    const s = this.step;
    const extra = s.quantities.length ? ` You need ${s.quantities.join(", ")}.` : "";
    return [
      { type: "step", index: i, step: s, total: this.tutorial.steps.length },
      { type: "say", text: `Step ${i + 1}. ${s.instruction}${extra}`, urgent: false },
    ];
  }
}
