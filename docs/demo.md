# How the demo video was made

The demo video is a recording of the real app, running on a real backend, with every model call live. We could not film a person doing a console repair before the deadline, so we made the camera replay footage instead. This page explains exactly what is real and what is staged.

## What is real

- The app, the backend and the Meta models: the steps, every verdict, every spoken warning, every SAM box, the transcriptions and the answers in the video come from live calls during the recording.
- The step splitting shown in the upload scene: a real upload of the 20-minute repair video, sped up (it took a little over 4 minutes).
- The timing: the coach's lines are placed at the moment the app produced them.

## What is staged

- **The camera.** The phone's camera is replaced by a replay of the tutorial's own footage, slightly zoomed and tilted so it does not look like the player. For the mistakes we chose footage from other moments of the same video: for example, the moment the old fan is lifted out of the board, shown while the coach is on "install the new fan".
- **The user's voice.** The user's lines ("Okay, I'm done.", "Next step.", "What happens if I power it on now?") are generated with Piper TTS and played into the microphone input, so they go through the real transcription.
- **The coach's voice.** The browser's speech synthesis cannot be recorded headless, so the coach's lines are re-voiced with Piper TTS at the exact time the app spoke them.
- **The edit.** Waiting time is fast-forwarded (labelled on screen) and the session jumps between steps with the Done button off screen. The video says "Camera replays the tutorial's own footage. Trimmed for time."

## How it was recorded

A Node script drives the app in headless Chromium through Playwright:

1. Before any page script runs, `navigator.mediaDevices.getUserMedia` is replaced: video comes from a canvas that draws a hidden `<video>` of the tutorial, audio comes from a Web Audio destination that plays the user's lines on cue. No real device is ever opened.
2. The script follows a scenario: open the step list, press Start, switch the replayed footage to a given time range, play a voice line, wait for a given server message (for example the guard's "Wait..."), and so on.
3. Every WebSocket message and every scenario mark is logged with a timestamp, and the screen is captured with the Chrome DevTools screencast at 975 by 1875 pixels.
4. A Python script turns the frames into constant frame rate video, cuts and speeds up segments using the logged marks, places the phone in a frame with captions, voices the coach's lines at their logged times, adds the narration and the music bed (which ducks under every voice), and normalizes loudness to -14 LUFS.

Slides are HTML pages in the app's style, rendered frame by frame by pausing CSS animations at each frame time.

## The scenes and the live output behind them

| Scene | Live output in the recording |
|---|---|
| Upload | real upload and prep of the console repair, 10 steps, two marked irreversible |
| Step 1 | "Step 1. Connect the charger and check if the fan blows or makes noise at the top grill." while its clip plays |
| Voice command | transcription "Okay, I'm done." then step 2 |
| The guard | at "Move the rubber dampers to the new fan, plug it in and screw it down", the user says "Next step." The coach: "Wait, the next step can't be undone. This step isn't finished yet. Lower the fan into place and line up all three screw holes. Say next again to continue anyway." SAM boxes the circuit board. |
| Question | "What happens if I power it on now?" answered: "With the fan loose you'll get rattling and risk pinching the flex cable. Seat the dampers on and get all three screws in first." |
| Any tutorial | recipe: "Stop cutting and wrap the dough tightly to rest." First aid: "Your wrap is missing, re-wrap tight then lock the clip." |

## Credits

- Console repair: "Nintendo Switch overheating repair - ANYONE can do this!!!" by Kiki Hobby Repair, Wikimedia Commons, CC BY 3.0
- Recipe: "Cooking with Laura: Homemade Pasta" by Northampton Community Television, Wikimedia Commons, CC BY 3.0
- First aid: "Emergency bandage application uk" by Dctrzl, Wikimedia Commons, CC BY 2.0
- Origami (used for tuning): "OrigamiCrane.ogv", Wikimedia Commons, CC BY 3.0
- Music: "Inspired" by Kevin MacLeod (incompetech.com), CC BY 3.0
- Illustrations: generated with Muse Image
- Voices: Piper TTS
