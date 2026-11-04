# Roadmap and future ideas

## Where it stands

Working today, end to end, with live Meta model calls:

- upload any mp4 tutorial, automatic steps with reference pictures and irreversible steps marked;
- step by step coaching with the tutorial's own clips, read aloud;
- live checks every 4 seconds, spoken warnings, SAM 3.1 boxes;
- the irreversible guard: no "next" before a point of no return until the camera has seen the step finished;
- hands-free commands and questions;
- tested on four very different tutorials: a console repair, a pasta recipe, a pressure bandage and an origami crane.

## Known limitations

| Limitation | Why | Idea |
|---|---|---|
| About 4 s per check | one Muse Spark call per 3 frames | trigger checks on motion or on "done", stream frames, smaller model for "nothing changed" |
| A few minutes of prep for long videos | the model watches the whole video | stream steps as they are found, cache popular tutorials |
| Clutter can mislead the judge | on the repair, the old fan lying on the mat looked like a missing new fan | track objects across frames with SAM 3.1 instead of judging single frames |
| Small objects in low-resolution video are hard to box | SAM needs visible pixels | send a higher resolution crop for grounding, use masks |
| The phone must be propped where it sees the work | a fixed camera | glasses (below) |
| English only | prompts and voice | Muse Spark and the voice model are multilingual: let the user pick a language |
| One user, no accounts, files on local disk | hackathon scope | storage, accounts, a tutorial library |

## Next: Meta AI glasses

The project was designed for glasses from day one. The phone is the stand-in: it plays the role of a first-person camera, a speaker and a microphone. Glasses already carry all three.

- **First-person camera.** It sees exactly what your hands see, at the right angle, without propping anything up. Verdicts get better because the work is always centred.
- **Open-ear audio.** The coach speaks in your ear, the room stays quiet, and the tutorial's narration can play the same way.
- **Microphone.** Commands and questions without touching anything, which matters most when your hands are covered in flour or holding a screwdriver.
- **A display, where available.** The SAM box or mask drawn over the real object, the current step and a timer in the corner of your view.
- **Same backend.** The coaching loop, the state machine and the irreversible guard do not change: only the input and output devices do.

## Every hands-on trade

The loop is generic: a reference video, a camera, a judge, a pointer and a voice. It applies anywhere hands follow steps.

- **Mechanics and repair.** Car maintenance, appliance repair, bikes: torque sequences, connectors, "did you put that bolt back?"
- **Electrical work.** Wiring a panel or a plug, with a hard stop before power is restored.
- **Lab protocols.** Following an SOP step by step, catching a skipped reagent or a wrong order, with a record of each step seen done.
- **Healthcare and first aid training.** Bandages, splints, CPR posture, checked live by the coach.
- **Manufacturing and onboarding.** Assembly lines and new staff learning a procedure from the video a senior worker recorded.
- **Robotics.** The same judge can check a robot's work against a reference, and the steps extracted from human tutorials can become training material for robots that learn by watching people.

## Product ideas

- **Creator mode.** Tutorial authors review the extracted steps, mark the critical ones and add their own common mistakes. Their videos become interactive.
- **Tutorial library.** Prepared tutorials shared between users, so nobody waits for prep twice.
- **Progress memory.** Remember where you stopped, what you got wrong last time, and warn earlier on those steps.
- **Quantities and timers.** Read scales, thermometers and multimeters in the frame and compare with the step's quantities.
- **Better recovery.** When a mistake happens anyway, a recovery plan instead of a single sentence.
- **Session report.** The saves made by the coach, the time per step, and a short summary to share.
- **On-device checks.** A small local model decides when something changed, and only then calls Muse Spark, to cut latency and cost.

## Technical next steps

1. Track the highlighted object over time with SAM 3.1 video tracking and draw masks instead of boxes.
2. Event-driven checks: run a check when the scene changes or when the user says done, not on a fixed timer.
3. Stream prep results so coaching can start before the whole video is processed.
4. Persist tutorials and sessions (database and object storage) and deploy the backend.
5. A glasses client using the same WebSocket protocol.
