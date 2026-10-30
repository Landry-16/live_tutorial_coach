// Day 1 feasibility probe: latency of the live check, SAM on one image, YouTube link support.
// Usage: npm run probe [-- path/to/a.jpg path/to/b.jpg ...]
import { readFileSync } from "node:fs";
import { meta, MODELS, jpegDataUrl } from "../src/meta.ts";

const SAMPLE = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Avocado_Hass_-_single_and_halved.jpg/640px-Avocado_Hass_-_single_and_halved.jpg";
const images = process.argv.slice(2).map((p) => jpegDataUrl(readFileSync(p)));
const frames = images.length ? images : [SAMPLE];

async function timed<T>(label: string, fn: () => Promise<T>) {
  const t = performance.now();
  try {
    const out = await fn();
    console.log(`\n[${label}] ${Math.round(performance.now() - t)} ms`);
    return out;
  } catch (e) {
    console.log(`\n[${label}] FAILED after ${Math.round(performance.now() - t)} ms: ${(e as Error).message}`);
  }
}

for (const effort of ["minimal", "low"] as const) {
  const r = await timed(`spark verdict, ${frames.length} image(s), effort=${effort}`, () =>
    meta.responses.create({
      model: MODELS.spark,
      reasoning: { effort },
      max_output_tokens: 4000,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: 'Step: "Halve the avocado and remove the pit." Is the step done in these photos? Answer JSON {"status":"on_track|deviation|step_done|unsure","message":"short"}' },
          ...frames.map((url) => ({ type: "input_image" as const, image_url: url, detail: "auto" as const })),
        ],
      }],
    }),
  );
  if (r) console.log(r.output_text, r.usage);
}

const sam = await timed("sam 3.1 on one image", () =>
  meta.responses.create({
    model: MODELS.sam,
    input: [{ role: "user", content: [
      { type: "input_text", text: "avocado" },
      { type: "input_image", image_url: frames[0], detail: "auto" },
    ] }],
  }),
);
if (sam) console.log(sam.output_text.slice(0, 200));

const yt = await timed("youtube link as input_video", () =>
  meta.responses.create({
    model: MODELS.spark,
    reasoning: { effort: "low" },
    max_output_tokens: 4000,
    input: [{ role: "user", content: [
      { type: "input_text", text: "Describe this video in one sentence." },
      // input_video is Meta-specific, not in the OpenAI SDK types
      { type: "input_video", video_url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" } as never,
    ] }],
  }),
);
if (yt) console.log(yt.output_text);
