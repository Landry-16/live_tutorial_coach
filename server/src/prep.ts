// Prep pipeline, once per tutorial: narration transcript, steps.json, one reference image per step.
import { execFile } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { TutorialSchema, type Tutorial, type TutorialStatus } from "../../shared/contracts.ts";
import { askJson } from "./llm.ts";
import { API_KEY, meta, MODELS } from "./meta.ts";
import { tutorialDir } from "./store.ts";

const run = promisify(execFile);
const ASR_CHUNK_S = 540; // transcribe accepts at most 10 minutes per request

async function duration(video: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]);
  return Number(stdout.trim());
}

async function hasAudio(video: string): Promise<boolean> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", video]);
  return stdout.trim().length > 0;
}

type Turn = { start_s: number; end_s: number; text: string };

async function transcribe(video: string, dir: string, total: number): Promise<Turn[]> {
  if (!(await hasAudio(video))) return [];
  const turns: Turn[] = [];
  for (let start = 0; start < total; start += ASR_CHUNK_S) {
    const wav = `${dir}/chunk.wav`;
    await run("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(start), "-t", String(ASR_CHUNK_S), "-i", video,
      "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", wav]);
    const form = new FormData();
    form.append("request", new Blob([JSON.stringify({ model: MODELS.asr, audioEncoding: "WAV", mode: "ENDPOINTING" })], { type: "application/json" }));
    form.append("audio", new Blob([await readFile(wav)], { type: "audio/wav" }), "audio.wav");
    const res = await fetch("https://api.meta.ai/v1/asr/transcribe", {
      method: "POST", headers: { Authorization: `Bearer ${API_KEY}` }, body: form,
    });
    if (!res.ok) throw new Error(`transcribe ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { turns: { startMs: number; endMs: number; transcript: string }[] };
    for (const t of body.turns) turns.push({ start_s: start + t.startMs / 1000, end_s: start + t.endMs / 1000, text: t.transcript });
    await rm(wav);
  }
  return turns;
}

async function findSteps(video: string, turns: Turn[], total: number): Promise<Tutorial> {
  const file = await meta.files.create({ file: createReadStream(video), purpose: "user_data" });
  const narration = turns.length
    ? turns.map((t) => `[${t.start_s.toFixed(1)}s - ${t.end_s.toFixed(1)}s] ${t.text}`).join("\n")
    : "(no narration, rely on the visuals)";
  const prompt = `This is a video tutorial (${total.toFixed(0)} s long). Its narration, with timestamps:
${narration}

Split it into the steps a person must do to follow along, in order, between 4 and 15 steps.
For each step:
- start_s / end_s: the segment of the video that shows this step, in seconds.
- instruction: what to do, imperative, one or two short sentences, spoken aloud by a coach.
- expected_end_state: what the result looks like when the step is done, visible on camera ("egg whites stiff and glossy").
- reference_s: the moment inside the step where the result is best visible in close-up (the food, not the presenter's face), in seconds.
- irreversible: true only when a mistake made at this step cannot be fixed afterwards (adding an ingredient to a mix, putting in the oven, cutting to size). Most steps are false; preparing, mixing, kneading or resting are false.
- timer_s: waiting time in seconds if the step has one, else null.
- quantities: amounts mentioned for this step ("200 g flour"), else [].
- common_mistakes: 1 to 3 mistakes a beginner makes at this step, visible on camera.
title: the name of the dish or project.
Write in English. id starts at 0.`;
  try {
    return await askJson(TutorialSchema, "tutorial", [{
      role: "user",
      content: [{ type: "input_text", text: prompt }, { type: "input_file", file_id: file.id }],
    }], "low");
  } finally {
    await meta.files.delete(file.id).catch(() => {});
  }
}

export async function prepare(id: string, setStatus: (s: TutorialStatus) => void): Promise<void> {
  const dir = tutorialDir(id);
  const video = `${dir}/tutorial.mp4`;
  try {
    const total = await duration(video);
    setStatus({ state: "processing", stage: "Listening to the narration" });
    const cached = `${dir}/narration.json`; // reused when re-running prep on the same video
    const turns: Turn[] = existsSync(cached) ? JSON.parse(await readFile(cached, "utf8")) : await transcribe(video, dir, total);
    setStatus({ state: "processing", stage: "Watching the tutorial and finding the steps" });
    const raw = await findSteps(video, turns, total);
    const steps = raw.steps
      .sort((a, b) => a.start_s - b.start_s)
      .map((s, i) => {
        const start_s = Math.max(0, s.start_s);
        const end_s = Math.min(total, Math.max(s.end_s, start_s + 1));
        const inside = s.reference_s >= start_s && s.reference_s <= end_s;
        return { ...s, id: i, start_s, end_s, reference_s: inside ? s.reference_s : Math.max(start_s, end_s - 0.5) };
      });
    const tutorial: Tutorial = { title: raw.title, steps };

    setStatus({ state: "processing", stage: "Taking a reference picture of each step" });
    await mkdir(`${dir}/ref`, { recursive: true });
    for (const s of steps) {
      await run("ffmpeg", ["-loglevel", "error", "-y", "-ss", s.reference_s.toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "5", `${dir}/ref/${s.id}.jpg`]);
    }
    await writeFile(`${dir}/narration.json`, JSON.stringify(turns, null, 2));
    await writeFile(`${dir}/steps.json`, JSON.stringify(tutorial, null, 2));
    setStatus({ state: "ready", tutorial });
  } catch (e) {
    console.error(`prep ${id} failed`, e);
    setStatus({ state: "failed", error: (e as Error).message });
  }
}

export async function reference(id: string, stepId: number): Promise<string | null> {
  const p = `${tutorialDir(id)}/ref/${stepId}.jpg`;
  return existsSync(p) ? `data:image/jpeg;base64,${(await readFile(p)).toString("base64")}` : null;
}
