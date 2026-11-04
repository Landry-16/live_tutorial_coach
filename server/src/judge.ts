// Live calls: verdict on the latest photos, SAM outline, spoken questions.
import { VerdictSchema, type Box, type Step, type Tutorial, type Verdict } from "../../shared/contracts.ts";
import { askJson } from "./llm.ts";
import { meta, MODELS } from "./meta.ts";

export const OCCLUSION_RE = /\b(move (your |the )?hands?|hands? (are |in the |blocking|covering)|cannot see|can't see|unclear view|obstructing|obstruction|in the way|block(ing|s) the view)\b/i;

export function isOcclusionMessage(msg: string): boolean {
  return OCCLUSION_RE.test(msg);
}

export function cleanVerdict(raw: Verdict): Verdict {
  // If the model reported a deviation purely due to hands or temporary obstruction,
  // sanitize it to 'unsure' so normal hand movement is never treated as a user error.
  if (raw.status === "deviation" && isOcclusionMessage(raw.message)) {
    return {
      status: "unsure",
      message: "Work is temporarily obscured; continuing observation.",
      object_to_highlight: null,
    };
  }

  // If status is unsure and message is a naggy visibility command, soften it
  if (raw.status === "unsure" && isOcclusionMessage(raw.message)) {
    return {
      ...raw,
      message: "Work is temporarily occluded.",
      object_to_highlight: null,
    };
  }

  return raw;
}

export async function checkStep(
  step: Step,
  next: Step | undefined,
  reference: string | null,
  frames: string[],
  recent: string[],
  progress: string[] = [],
): Promise<Verdict> {
  const prompt = `You are a hands-on coach watching the user through a phone camera, following a video tutorial.
Current step: "${step.instruction}"
Expected state at the end of the step: "${step.expected_end_state}"
Common mistakes: ${step.common_mistakes.join("; ") || "none listed"}
${next?.irreversible ? `The next step cannot be undone: "${next.instruction}".` : ""}
${reference ? "The FIRST image is the tutorial at the end of this step. The other images are the user's camera, oldest first." : "The images are the user's camera, oldest first."}
Things you already told the user: ${recent.join(" | ") || "nothing yet"}
${progress.length ? `Prior progress observed on this step: ${progress.join(" | ")}. Note: Prior progress indicates work underway, but does not prove current completion—verify current state in the images.` : ""}

Decide:
- on_track: the user is actively working on this step and nothing is wrong yet. Normal hand movements, holding tools, stirring, folding, or manipulating materials are normal work-in-progress, NEVER a deviation.
- deviation: you clearly see an actual mistake for this step (wrong action, wrong amount, wrong direction, or a common mistake listed above). Do NOT guess. Hands or tools temporarily in the way are NOT a deviation. A result this step's instruction would not produce (a diagonal fold when the step says edge to edge, a different shape, the wrong ingredient) IS a deviation, even while the hands are still moving.
- step_done: the user has finished the action and the resulting state clearly matches the expected end state (compare with the reference image if present). If the user is still actively performing the action (hands manipulating tools or materials), choose on_track. Do NOT declare step_done on partial or ambiguous work.
- unsure: the camera is pointed away or view of the work is completely obstructed so state cannot be determined. If hands are simply doing normal work, choose on_track instead of unsure. Do NOT tell the user to move their hands when they are actively working.
message: one short sentence spoken to the user, second person, at most 20 words, actionable. If unsure due to temporary obstruction, stay encouraging or quiet; do not repeatedly tell the user to move their hands. Do not repeat what you already said.
object_to_highlight: the physical thing concerned, a short noun phrase you could point at (like "mixing bowl", "left flap", "paper"), never an action like "diagonal fold"; or null.`;

  const images = [...(reference ? [reference] : []), ...frames];
  const verdict = await askJson(VerdictSchema, "verdict", [{
    role: "user",
    content: [
      { type: "input_text", text: prompt },
      ...images.map((image_url) => ({ type: "input_image" as const, image_url, detail: "auto" as const })),
    ],
  }]);
  return cleanVerdict(verdict);
}

const BOX = /<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)/;

// shortcut: keeps only the first box, no mask; decode masks with @meta-sam/parser if we want outlines.
export async function locate(label: string, frame: string): Promise<Box | null> {
  const r = await meta.responses.create({
    model: MODELS.sam,
    input: [{ role: "user", content: [
      { type: "input_text", text: label },
      { type: "input_image", image_url: frame, detail: "auto" },
    ] }],
  });
  const m = BOX.exec(r.output_text);
  const noun = label.trim().split(/\s+/).at(-1)!;
  if (!m) return noun !== label.trim() ? locate(noun, frame) : null; // "square paper" -> "paper"
  const [x1, y1, x2, y2, w, h] = m.slice(1).map(Number);
  return { x1, y1, x2, y2, w, h };
}

export async function answer(question: string, tutorial: Tutorial, index: number, recent: string[]): Promise<string> {
  const r = await meta.responses.create({
    model: MODELS.spark,
    reasoning: { effort: "low" },
    max_output_tokens: 4000,
    input: `You are a hands-on coach. The user is on step ${index + 1} of this tutorial:
${JSON.stringify(tutorial)}
What you last told the user, newest last: ${recent.join(" | ") || "nothing yet"}
The user asks: "${question}"
If they ask how to fix or recover from a mistake, base the fix on that mistake, this step and the tutorial's own quantities and timings.
Answer in at most two short spoken sentences, no markdown.`,
  });
  return r.output_text.trim();
}
