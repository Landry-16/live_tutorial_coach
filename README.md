# Live Tutorial Coach

Upload a cooking video, prop your phone up, and get a hands-free coach: it reads each step aloud, plays the matching part of the tutorial at your pace, watches you through the camera, and stops you before a mistake you can't undo.

Built for the Meta Global AI Developer Hackathon (Oct 26 to Nov 4, 2026) with Muse Spark, SAM 3.1 and Muse Voice Transcribe.

## Run it

Needs Node 22+ and `ffmpeg` / `ffprobe` on the PATH.

```bash
npm install
echo "METAKEY=<your Meta Model API key>" > .env
```

Two terminals:

```bash
npm run dev -w server   # API + WebSocket on :8787
npm run dev -w web      # app on https://<your-ip>:5173 (self-signed, accept the warning once)
```

Open the app on your phone (same Wi-Fi) so the camera and mic work over HTTPS. On the computer, `HTTP=1 npm run dev -w web` serves plain http on localhost.

## How it works

1. **Prep, once per tutorial** (`server/src/prep.ts`): ffmpeg extracts the audio, Muse Voice Transcribe returns the timestamped narration, Muse Spark 1.3 watches the uploaded video with that narration and returns `steps.json` (validated, one repair attempt), ffmpeg grabs a reference image per step.
2. **Live loop** (`server/src/session.ts`): every 4 s the phone sends 3 JPEG frames over the WebSocket. Muse Spark compares them with the step's reference image and returns a verdict. The state machine (`server/src/coach.ts`) decides whether to speak: 2 deviations in a row, a 15 s cooldown, a check before irreversible steps, and "vision proposes, voice confirms" for finished steps. On a deviation, SAM 3.1 boxes the object on the camera view.
3. **Voice**: the mic streams PCM to the backend, which proxies Muse Voice Transcribe realtime. Short utterances are commands (next, back, repeat, done), longer ones are questions answered by Muse Spark. The coach speaks with the browser's speech synthesis and lowers the tutorial volume while it talks.

Contracts shared by both sides: `shared/contracts.ts`.

## Tools for tuning

```bash
npm run probe -w server -- a.jpg b.jpg c.jpg               # latency of a verdict and of SAM
npm run live-test -w server -- <id> video.mp4 <step> 50 60   # replay video frames as the camera, print verdicts
npm run reprep -w server -- <id>                             # re-run prep on an uploaded tutorial
npm test -w server                                           # state machine tests
```

Measurements: `docs/feasibility.md`.
