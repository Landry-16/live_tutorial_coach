# Feasibility probe (2026-10-30)

Run with `npm run probe -- a.jpg b.jpg c.jpg` (script: `server/scripts/probe.ts`).

| Check | Result |
|---|---|
| Muse Spark 1.3, 3 photos (640 px) + step context, `reasoning.effort=minimal` | ~3.4 s, ~1,045 input tokens, ~230 output tokens (mostly reasoning) |
| Same with `effort=low` | ~3.5 s, ~370 output tokens |
| Verdict quality (halved avocado, step "halve and remove the pit") | Correct: "Halved but pit not removed" |
| SAM 3.1, one image, prompt "avocado" | ~1.2 s, box + mask |
| YouTube watch URL as `input_video` | Rejected: `unsupported media type text/html. Supported: MP4` |

Takeaways:
- A live check every ~4 s is realistic. Cost is about $0.003 per check, roughly $2.50 per hour of cooking.
- `minimal` effort is as good as `low` here and cheaper: default for the live loop.
- Upload `.mp4` is the only tutorial input, as decided.
- Still to measure on real cooking footage: false alarm rate and step-done detection.
