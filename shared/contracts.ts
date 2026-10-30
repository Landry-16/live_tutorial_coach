import { z } from "zod";

// steps.json, produced once per tutorial by the prep pipeline
export const StepSchema = z.strictObject({
  id: z.number().int(),
  start_s: z.number(),
  end_s: z.number(),
  instruction: z.string(),
  expected_end_state: z.string(),
  reference_s: z.number(), // best close-up of the expected end state, used as the reference image

  irreversible: z.boolean(),
  timer_s: z.number().nullable(),
  quantities: z.array(z.string()),
  common_mistakes: z.array(z.string()),
});

export const TutorialSchema = z.strictObject({
  title: z.string(),
  steps: z.array(StepSchema).min(1),
});

// verdict, produced by Muse Spark on every live check
export const VerdictSchema = z.strictObject({
  status: z.enum(["on_track", "deviation", "step_done", "unsure"]),
  message: z.string(),
  object_to_highlight: z.string().nullable(),
});

export type Step = z.infer<typeof StepSchema>;
export type Tutorial = z.infer<typeof TutorialSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;

export type Box = { x1: number; y1: number; x2: number; y2: number; w: number; h: number };
export type Command = "next" | "back" | "repeat" | "done";

export type TutorialStatus =
  | { state: "processing"; stage: string }
  | { state: "ready"; tutorial: Tutorial }
  | { state: "failed"; error: string };

// Phone -> backend. Mic audio goes as binary frames (PCM 16-bit, 24 kHz, mono).
export type ClientMsg =
  | { type: "start" }
  | { type: "frames"; images: string[] } // JPEG data URLs
  | { type: "command"; command: Command };

// Backend -> phone
export type ServerMsg =
  | { type: "step"; index: number; step: Step; total: number }
  | { type: "say"; text: string; urgent: boolean }
  | { type: "highlight"; label: string; box: Box | null }
  | { type: "verdict"; verdict: Verdict; ms: number }
  | { type: "heard"; text: string; final: boolean }
  | { type: "finished" }
  | { type: "error"; message: string };
