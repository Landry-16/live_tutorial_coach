# Problems we hit and how we solved them

A log of the real obstacles met while building Live Tutorial Coach during the Meta Global AI Developer Hackathon (October 26 to November 4, 2026), and what we changed to get past each one. Most of them came from the same tension: a coach that speaks too often gets switched off, and a coach that misses a real mistake is useless.

## 1. Getting tutorials into the model

**YouTube links are rejected.** Our first idea was to paste a YouTube link. Muse Spark's video input answers `unsupported media type text/html. Supported: MP4`.
**Solution:** the user uploads an mp4. The backend sends it through the Files API and deletes it once the steps are extracted.

**Transcription is limited to 10 minutes per request.** Real tutorials are often longer (our pasta video is 11 minutes, the console repair 20).
**Solution:** ffmpeg cuts the audio into 9-minute WAV chunks and the turns are shifted back to video time. The transcript is cached in `narration.json`, so re-running prep does not pay for it again.

**Prep was slow on long videos.** Transcription, upload and reference pictures ran one after the other.
**Solution (Ashmita):** the video upload runs in parallel with transcription, and the reference pictures are extracted in parallel. A 20-minute video still takes a little over 4 minutes, so the app shows the current stage while it waits.

## 2. Turning a video into good steps

**Reference pictures showed the presenter's face.** We first took the last frame of each step, which in cooking and repair videos is often the presenter talking to the camera.
**Solution:** a `reference_s` field. Muse Spark picks the moment inside the step where the result is best visible in close-up. Times outside the step fall back to the end of the step.

**Too many steps were marked irreversible**, so the coach asked for confirmation all the time.
**Solution:** a strict definition in the prompt ("a mistake made at this step cannot be fixed afterwards", most steps are false) with concrete examples.

**Then the electronics repair had none at all**, although powering on a board with a part missing is the textbook point of no return.
**Solution:** the examples now cover electronics too: powering on with a part missing or a connector loose, forcing a fragile part. On the console repair, the two "power on to test" steps are now marked.

**An extra field broke validation.** Storing the narration inside `steps.json` made the strict zod schema reject the file.
**Solution:** the narration lives in its own `narration.json`.

**Invalid JSON happens.** Even with `json_schema`, an answer can fail validation.
**Solution:** `askJson()` validates with zod and sends the error back once for a repaired answer before giving up.

## 3. Making the coach judge well

**Normal hand movement was called a mistake.** Hands in front of the work, a tool in the way, the motion of folding: early prompts flagged them.
**Solution (Ashmita):** occlusion-aware verdicts. The prompt says normal work is never a deviation, `cleanVerdict()` turns occlusion messages into `unsure`, and a single `unsure` does not reset the progress counters.

**Then the coach became too lenient.** Shown a sheet folded corner to corner while the step said edge to edge, it answered "on track: keep folding". The occlusion work had pushed it towards silence.
**Solution:** the prompt now says that a result this step would not produce (a diagonal fold when the step says edge to edge, a different shape, the wrong ingredient) is a deviation even while the hands are moving. We checked both ways on real footage: the diagonal fold was caught on every check we ran, and correct folding still gets no warning.

**Skipped steps went unnoticed.** Trying to lock the clip of a pressure bandage that was never wrapped, or cutting the pasta dough before its rest, got "on track".
**Solution:** "skipping ahead: the result of an earlier step is missing or was undone" is a deviation too. At the start of a normal step the earlier results are all there, so this does not create false alarms.

**Verdicts arrived after the user had moved on.** A check started on step 3 could answer while the user was already on step 4.
**Solution:** the session drops new frames while a check runs and discards a result if the step changed meanwhile, including during the SAM call.

**Auto-advance messages were lost.** After merging the automatic step progression, the coach moved to the next step but the phone was never told: the session treated the index change as "the user moved on" and dropped the messages.
**Solution:** the session compares the index after `onVerdict()`, not before, so the coach's own step change goes out.

## 4. Pointing at the problem with SAM 3.1

**SAM found nothing for actions.** Muse Spark named things like "diagonal fold"; SAM needs an object.
**Solution:** the prompt asks for a physical thing you could point at, never an action.

**SAM found nothing for small or specific objects** in low-resolution footage: "bandage", "new fan", "console".
**Solution:** Muse Spark gives up to 3 names, most specific first, then the larger thing it belongs to as it looks right now ("an opened device is a circuit board"), then its material. SAM tries them in order and the first one found becomes the label. A multi-word name that finds nothing is also retried with its last word ("square paper" becomes "paper").

**The box landed on a sliver at the edge of the image.** SAM returns one box per instance, and we kept the first.
**Solution:** keep the largest instance.

**A material alone can box the wrong thing.** On the console repair, "metal" boxed a screwdriver lying on the mat.
**Solution:** the containing object comes before the material ("fan | circuit board | metal"), and SAM reliably finds the circuit board.

## 5. Stopping mistakes before it is too late

**The guard only fired after a mistake.** The first version stopped "next" before an irreversible step only if the last verdict was a deviation. But the most dangerous case is an unfinished step: the new fan is not seated yet and the user wants to power the console on. The camera calls that "on track", because it is work in progress.
**Solution:** before an irreversible step, "next" needs the camera to have seen the current step finished. Otherwise the coach says "Wait, the next step can't be undone. This step isn't finished yet..." and asks to say next again to continue anyway. The user stays in charge, but never by accident.

**The guard said why but did not show where.**
**Solution:** it highlights what the last check named. Commands are answered at once and the SAM box follows when it is ready, so the warning is never delayed by the box.

**Moving on by itself is risky before an irreversible step.**
**Solution (Ashmita):** auto-advance needs two `step_done` checks in a row and is disabled when this step or the next one is irreversible; the coach asks "Looks done. The next step can't be undone. Say done or next to proceed." instead.

## 6. Voice

**The coach heard itself.** Speech synthesis came back through the microphone and was transcribed as a question.
**Solution:** while the coach speaks, the phone sends silence of the same length instead of the microphone, which also keeps the stream in real time as the API requires.

**Short commands are misheard.** "Done." was once transcribed as "Dann".
**Solution:** commands are matched by keyword in utterances of at most 4 words, with several synonyms (done, finished, ready; next, skip; and French versions), and the on-screen buttons do the same thing.

**Mobile browsers block speech until the user taps.**
**Solution:** the Start button speaks an empty utterance to unlock speech synthesis.

**Questions need context.** "How do I fix it?" means nothing without the last warning.
**Solution:** answers get the whole tutorial, the current step and the coach's last three lines.

## 7. Phone and browser

**Camera and microphone need HTTPS** on a phone.
**Solution:** the Vite dev server uses a self-signed certificate, and `HTTP=1` serves plain http on the laptop.

**Devices stayed open after leaving the screen** when the camera or microphone permission arrived after the user had already left.
**Solution:** a device that opens after the screen is gone is released at once.

**Testing must never open a real webcam.** During development, an automated browser opened the developer's real camera.
**Solution:** all browser automation replaces `getUserMedia` with a replayed video clip and a silent audio stream before any page script runs.

## 8. The demo video

**Nobody could film a person doing the task** before the deadline.
**Solution:** the camera replays the tutorial's own footage, chosen at the moments we needed (for the mistake, footage from another moment of the same video). Every model call is live, and the video says so on screen. See [demo.md](demo.md).

**Finding a tutorial with a clear free licence.** Cooking, origami, first aid, bookbinding, carpentry, sewing, console repair: we searched Wikimedia Commons, tested four tutorials end to end, and kept a CC BY 3.0 console repair because it has close-up footage and real points of no return.

**Model behaviour on a different video can surprise you.** On the repair, the old fan lying on the mat made the coach think the new one was not installed yet. We kept that honest in the video: the user confirms the step by voice instead of the camera.

## What we learned

- Tune prompts on real footage, both ways: every rule that catches a mistake has to be checked against correct work too. The `live-test` script made that cheap.
- Keep the decision logic out of the model. Muse Spark judges a picture; a small, tested state machine decides when to speak.
- Grounding needs names that a segmentation model can find. Asking for a chain of names, from specific to generic, made SAM reliable.
- The user must stay in charge: the coach can stop you once, never twice.
