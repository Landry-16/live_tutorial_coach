// Session state machine: decides when the coach speaks. Pure, no I/O, so it is unit tested.
import type { Command, ServerMsg, Step, Tutorial, Verdict } from "../../shared/contracts.ts";

export const DEVIATIONS_BEFORE_SPEAKING = 2;
export const COOLDOWN_MS = 15_000;
export const CONFIRMATIONS_BEFORE_ADVANCE = 2;
export const MAX_PROGRESS_NOTES = 5;
export const VISIBILITY_WARNING_THRESHOLD = 4;

export type CoachOptions = {
  autoAdvance?: boolean;
};

export class Coach {
  index = 0;
  private deviations = 0;
  private lastSpokeAt = -Infinity;
  private askedDone = false;
  private overrideArmed = false;
  private lastVerdict: Verdict | null = null;
  private doneConfirmations = 0;
  private consecutiveUnsure = 0;
  private hasAdvanced = false;
  private progressNotes: string[] = [];
  readonly autoAdvance: boolean;

  constructor(readonly tutorial: Tutorial, options: CoachOptions = {}) {
    this.autoAdvance = options.autoAdvance ?? true;
  }

  get step(): Step {
    return this.tutorial.steps[this.index];
  }

  get nextStep(): Step | undefined {
    return this.tutorial.steps[this.index + 1];
  }

  getProgressSummary(): string[] {
    return [...this.progressNotes];
  }

  private recordProgress(note: string) {
    if (!note || note === "msg" || note.length < 3) return;
    if (!this.progressNotes.includes(note)) {
      this.progressNotes.push(note);
      if (this.progressNotes.length > MAX_PROGRESS_NOTES) {
        this.progressNotes.shift();
      }
    }
  }

  start(): ServerMsg[] {
    return this.enterStep(this.index);
  }

  onVerdict(v: Verdict, now: number, ms: number): ServerMsg[] {
    this.lastVerdict = v;
    const out: ServerMsg[] = [{ type: "verdict", verdict: v, ms }];
    const cooledDown = now - this.lastSpokeAt >= COOLDOWN_MS;

    // Once a step has completed and advanced, drop subsequent verdicts for that step
    if (this.hasAdvanced) return out;

    if (v.status === "deviation") {
      this.doneConfirmations = 0;
      this.consecutiveUnsure = 0;
      this.recordProgress(v.message);
      if (++this.deviations >= DEVIATIONS_BEFORE_SPEAKING && cooledDown) {
        this.deviations = 0;
        this.lastSpokeAt = now;
        out.push({ type: "say", text: v.message, urgent: true });
        if (v.object_to_highlight) out.push({ type: "highlight", label: v.object_to_highlight, box: null });
      }
      return out;
    }

    if (v.status === "on_track") {
      this.deviations = 0;
      this.doneConfirmations = 0;
      this.consecutiveUnsure = 0;
      this.recordProgress(v.message);
      return out;
    }

    if (v.status === "unsure") {
      this.consecutiveUnsure++;
      // Temporary occlusion allows a single unsure frame without resetting confirmations,
      // but sustained uncertainty resets them.
      if (this.consecutiveUnsure > 1) {
        this.doneConfirmations = 0;
      }
      // Note: we do NOT reset this.deviations on unsure to prevent occlusion from dodging deviation confirmation!

      // If we observed a step_done before, but completion is now visually uncertain, use voice confirmation
      if (this.doneConfirmations >= 1 && cooledDown && !this.askedDone) {
        this.askedDone = true;
        this.lastSpokeAt = now;
        out.push({ type: "say", text: "Looks done. Say done to go on.", urgent: false });
        return out;
      }

      // Gentle visibility reminder only after prolonged obstruction, respecting cooldown
      if (this.consecutiveUnsure >= VISIBILITY_WARNING_THRESHOLD && cooledDown && !this.askedDone) {
        this.lastSpokeAt = now;
        out.push({ type: "say", text: "Keep the work in camera view so I can help.", urgent: false });
      }
      return out;
    }

    if (v.status === "step_done") {
      this.deviations = 0;
      this.consecutiveUnsure = 0;
      this.doneConfirmations++;
      this.recordProgress(v.message);

      const isIrreversible = Boolean(this.step.irreversible || this.nextStep?.irreversible);

      // Auto-advance path: requires confirmation across independent checks and reversible step
      if (this.autoAdvance && !isIrreversible) {
        if (this.doneConfirmations >= CONFIRMATIONS_BEFORE_ADVANCE) {
          this.hasAdvanced = true;
          this.lastSpokeAt = now;
          if (!this.nextStep) {
            out.push(
              { type: "say", text: "That was the last step. Well done!", urgent: false },
              { type: "finished" },
            );
          } else {
            out.push({ type: "say", text: "Step complete!", urgent: false });
            out.push(...this.enterStep(this.index + 1));
          }
          return out;
        }
        // First check not yet confirmed: wait for second confirmation
        return out;
      }

      // Explicit confirmation required for irreversible steps or when auto-advance is disabled
      if (!this.askedDone && cooledDown) {
        this.askedDone = true;
        this.lastSpokeAt = now;
        const prompt = isIrreversible
          ? (this.nextStep?.irreversible
              ? "Looks done. The next step can't be undone. Say done or next to proceed."
              : "Looks done. This step is irreversible. Say done or next to proceed.")
          : "Looks done. Say done to go on.";
        out.push({ type: "say", text: prompt, urgent: false });
      }
      return out;
    }

    return out;
  }

  onCommand(cmd: Command): ServerMsg[] {
    if (cmd === "repeat") return this.enterStep(this.index);
    if (cmd === "back") return this.enterStep(Math.max(0, this.index - 1));

    // Point of no return: the next step cannot be undone and the camera has not seen this one finished.
    const v = this.lastVerdict;
    if (this.nextStep?.irreversible && v && v.status !== "step_done" && !this.overrideArmed) {
      this.overrideArmed = true;
      const why = v.status === "deviation" ? v.message
        : v.status === "unsure" ? "I can't see your work to check it."
        : `This step isn't finished yet. ${v.message}`;
      return [{ type: "say", text: `Wait, the next step can't be undone. ${why} Say next again to continue anyway.`, urgent: true }];
    }
    if (!this.nextStep) return [{ type: "say", text: "That was the last step. Well done!", urgent: false }, { type: "finished" }];
    return this.enterStep(this.index + 1);
  }

  private enterStep(i: number): ServerMsg[] {
    this.index = i;
    this.deviations = 0;
    this.doneConfirmations = 0;
    this.consecutiveUnsure = 0;
    this.hasAdvanced = false;
    this.progressNotes = [];
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
