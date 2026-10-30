// Live calls: verdict on the latest photos, SAM outline, spoken questions.
import { VerdictSchema, type Box, type Step, type Tutorial, type Verdict } from "../../shared/contracts.ts";
import { askJson } from "./llm.ts";
import { meta, MODELS } from "./meta.ts";

export async function checkStep(
  step: Step,
  next: Step | undefined,
  reference: string | null,
  frames: string[],
  recent: string[],
): Promise<Verdict> {
  const prompt = `You are a cooking coach watching the user through a phone camera, following a video tutorial.
Current step: "${step.instruction}"
Expected state at the end of the step: "${step.expected_end_state}"
Common mistakes: ${step.common_mistakes.join("; ") || "none listed"}
${next?.irreversible ? `The next step cannot be undone: "${next.instruction}".` : ""}
${reference ? "The FIRST image is the tutorial at the end of this step. The other images are the user's camera, oldest first." : "The images are the user's camera, oldest first."}
Things you already told the user: ${recent.join(" | ") || "nothing yet"}

Decide:
- on_track: the user is doing this step and nothing is wrong yet.
- deviation: you clearly see a mistake for this step (wrong action, wrong amount, wrong state, a common mistake). Do not guess.
- step_done: the user's state matches the expected end state.
- unsure: you cannot see the work (hands or camera in the way, nothing in frame).
message: one short sentence spoken to the user, second person, at most 20 words, actionable. Do not repeat what you already said.
object_to_highlight: a short noun phrase naming the physical object concerned (like "mixing bowl"), or null.`;

  const images = [...(reference ? [reference] : []), ...frames];
  return askJson(VerdictSchema, "verdict", [{
    role: "user",
    content: [
      { type: "input_text", text: prompt },
      ...images.map((image_url) => ({ type: "input_image" as const, image_url, detail: "auto" as const })),
    ],
  }]);
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
  if (!m) return null;
  const [x1, y1, x2, y2, w, h] = m.slice(1).map(Number);
  return { x1, y1, x2, y2, w, h };
}

export async function answer(question: string, tutorial: Tutorial, index: number): Promise<string> {
  const r = await meta.responses.create({
    model: MODELS.spark,
    reasoning: { effort: "low" },
    max_output_tokens: 4000,
    input: `You are a cooking coach. The user is on step ${index + 1} of this tutorial:
${JSON.stringify(tutorial)}
The user asks: "${question}"
Answer in at most two short spoken sentences, no markdown.`,
  });
  return r.output_text.trim();
}
