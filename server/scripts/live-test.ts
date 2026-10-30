// Replays frames from a video as if they came from the phone camera, prints what the coach does.
// Usage: npm run live-test -- <tutorial id> <video.mp4> <step index> <t1> [t2 ...]
// Each t is a time in the video; 3 frames are taken around it (t, t+0.5, t+1).
import { execFileSync } from "node:child_process";
import WebSocket from "ws";
import type { ServerMsg } from "../../shared/contracts.ts";

const [id, video, stepArg, ...times] = process.argv.slice(2);
const frame = (t: number) =>
  "data:image/jpeg;base64," +
  execFileSync("ffmpeg", ["-loglevel", "error", "-ss", t.toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "5", "-f", "image2pipe", "-c:v", "mjpeg", "-"]).toString("base64");

const ws = new WebSocket(`ws://localhost:${process.env.PORT ?? 8787}/ws/${id}`);
let pending = 0;
const sendNext = () => {
  const t = times.shift();
  if (t === undefined) return setTimeout(() => ws.close(), 15_000); // let a SAM highlight arrive
  pending++;
  console.log(`\n>> frames at ${t}s`);
  ws.send(JSON.stringify({ type: "frames", images: [0, 0.5, 1].map((d) => frame(Number(t) + d)) }));
};

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "start" }));
  for (let i = 0; i < Number(stepArg); i++) ws.send(JSON.stringify({ type: "command", command: "next" }));
  sendNext();
});
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString()) as ServerMsg;
  if (m.type === "step") console.log(`[step ${m.index}] ${m.step.instruction}`);
  else if (m.type === "verdict") {
    console.log(`[verdict ${m.ms} ms] ${m.verdict.status}: ${m.verdict.message} (${m.verdict.object_to_highlight})`);
    if (--pending === 0) sendNext();
  } else if (m.type === "error") {
    console.log(`[error] ${m.message}`);
    if (--pending === 0) sendNext();
  } else console.log(`[${m.type}]`, JSON.stringify(m).slice(0, 160));
});
ws.on("close", (code, reason) => console.log("closed", code, reason.toString()));
