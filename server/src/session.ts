// One live coaching session per phone WebSocket.
import type { ClientMsg, Command, ServerMsg, Tutorial } from "../../shared/contracts.ts";
import { AsrStream } from "./asr.ts";
import { Coach } from "./coach.ts";
import { answer, checkStep, locate } from "./judge.ts";
import { reference } from "./prep.ts";

const COMMANDS: [RegExp, Command][] = [
  [/\b(next|skip|suivant)\b/i, "next"],
  [/\b(done|finished|ready|fini|terminé)\b/i, "done"],
  [/\b(repeat|again|répète)\b/i, "repeat"],
  [/\b(back|previous|retour)\b/i, "back"],
];

export function parseCommand(text: string): Command | null {
  if (text.trim().split(/\s+/).length > 4) return null; // longer utterances are questions
  return COMMANDS.find(([re]) => re.test(text))?.[1] ?? null;
}

export class Session {
  private coach: Coach;
  private checking = false;
  private recent: string[] = [];
  private asr: AsrStream;

  constructor(private readonly id: string, tutorial: Tutorial, private readonly send: (m: ServerMsg) => void) {
    this.coach = new Coach(tutorial);
    this.asr = new AsrStream({
      onPartial: (text) => send({ type: "heard", text, final: false }),
      onFinal: (text) => void this.onVoice(text),
      onError: (message) => console.warn("asr:", message),
    });
  }

  onMessage(msg: ClientMsg) {
    if (msg.type === "start") this.emit(this.coach.start());
    else if (msg.type === "command") this.emit(this.coach.onCommand(msg.command));
    else if (msg.type === "frames") void this.check(msg.images);
  }

  onAudio(pcm: Buffer) {
    this.asr.push(pcm);
  }

  close() {
    this.asr.close();
  }

  private emit(msgs: ServerMsg[]) {
    for (const m of msgs) {
      if (m.type === "say") this.recent = [...this.recent, m.text].slice(-3);
      this.send(m);
    }
  }

  private async check(frames: string[]) {
    if (this.checking || !frames.length) return; // drop frames while a check is running
    this.checking = true;
    const index = this.coach.index;
    const t0 = performance.now();
    try {
      const step = this.coach.step;
      const ref = await reference(this.id, step.id);
      const verdict = await checkStep(step, this.coach.nextStep, ref, frames, this.recent);
      if (this.coach.index !== index) return; // the user moved on meanwhile
      const msgs = this.coach.onVerdict(verdict, Date.now(), Math.round(performance.now() - t0));
      for (const m of msgs) {
        if (m.type === "highlight") m.box = await locate(m.label, frames.at(-1)!).catch(() => null);
      }
      this.emit(msgs);
    } catch (e) {
      this.send({ type: "error", message: `check failed: ${(e as Error).message}` });
    } finally {
      this.checking = false;
    }
  }

  private async onVoice(text: string) {
    this.send({ type: "heard", text, final: true });
    const cmd = parseCommand(text);
    if (cmd) return this.emit(this.coach.onCommand(cmd));
    if (text.trim().split(/\s+/).length < 2) return;
    try {
      this.emit([{ type: "say", text: await answer(text, this.coach.tutorial, this.coach.index), urgent: false }]);
    } catch (e) {
      this.send({ type: "error", message: `answer failed: ${(e as Error).message}` });
    }
  }
}
