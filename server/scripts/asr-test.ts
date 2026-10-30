// Streams the audio of a video through the realtime transcription proxy, paced like a live mic.
// Usage: npm run asr-test -- video.mp4 [start_s] [seconds]
import { execFileSync } from "node:child_process";
import { AsrStream } from "../src/asr.ts";

const [video, start = "10", seconds = "15"] = process.argv.slice(2);
const pcm = execFileSync("ffmpeg", ["-loglevel", "error", "-ss", start, "-t", seconds, "-i", video, "-vn", "-ac", "1", "-ar", "24000", "-f", "s16le", "-"]);
const CHUNK = 3840; // 80 ms at 24 kHz, 16-bit

const t0 = Date.now();
const asr = new AsrStream({
  onPartial: () => {},
  onFinal: (text) => console.log(`[final +${((Date.now() - t0) / 1000).toFixed(1)} s] ${text}`),
  onError: (e) => console.log("[error]", e),
});
for (let i = 0; i < pcm.length; i += CHUNK) {
  asr.push(pcm.subarray(i, i + CHUNK));
  await new Promise((r) => setTimeout(r, 80));
}
await new Promise((r) => setTimeout(r, 3000));
asr.close();
setTimeout(() => process.exit(0), 2000);
