import { useEffect, useRef, useState } from "react";
import type { Box, ClientMsg, Command, ServerMsg, Step, Tutorial, Verdict } from "../../shared/contracts.ts";
import { grabFrame, openCamera, openMic, Voice } from "./media.ts";
import { clock } from "./time.ts";

const CHECK_EVERY_MS = 4000;
const FRAME_GAP_MS = 500;
const HIGHLIGHT_MS = 8000;

type Highlight = { label: string; box: Box | null };

export function Coach({ id, tutorial, onExit }: { id: string; tutorial: Tutorial; onExit: () => void }) {
  const player = useRef<HTMLVideoElement>(null);
  const camera = useRef<HTMLVideoElement>(null);
  const ws = useRef<WebSocket | null>(null);
  const voice = useRef<Voice | null>(null);
  const stepRef = useRef<Step | null>(null);

  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step | null>(null);
  const [line, setLine] = useState<{ text: string; urgent: boolean } | null>(null);
  const [verdict, setVerdict] = useState<{ v: Verdict; ms: number } | null>(null);
  const [heard, setHeard] = useState("");
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [aspect, setAspect] = useState(4 / 3);

  const send = (m: ClientMsg) => ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify(m));
  const command = (c: Command) => send({ type: "command", command: c });

  useEffect(() => {
    const v = new Voice((on) => { if (player.current) player.current.volume = on ? 0.15 : 1; });
    voice.current = v;
    let highlightTimer = 0;

    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${id}`);
    socket.binaryType = "arraybuffer";
    ws.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: "start" } satisfies ClientMsg));
    socket.onclose = (e) => { if (e.code !== 1000 && e.code !== 1005) setProblem(`Connection lost (${e.reason || e.code})`); };
    socket.onmessage = (e) => {
      const m = JSON.parse(e.data) as ServerMsg;
      switch (m.type) {
        case "step": {
          stepRef.current = m.step;
          setIndex(m.index);
          setStep(m.step);
          setWaiting(false);
          setHighlight(null);
          setLine(null);
          const p = player.current;
          if (p) { p.currentTime = m.step.start_s; void p.play(); }
          break;
        }
        case "say":
          v.say(m.text, m.urgent);
          if (!m.text.startsWith("Step ")) setLine({ text: m.text, urgent: m.urgent }); // step announcements are already on the card
          break;
        case "highlight":
          setHighlight(m);
          clearTimeout(highlightTimer);
          highlightTimer = window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
          break;
        case "verdict": setVerdict({ v: m.verdict, ms: m.ms }); break;
        case "heard": setHeard(m.text); break;
        case "finished": setFinished(true); break;
        case "error": console.warn(m.message); break;
      }
    };

    const cleanups: (() => void)[] = [];
    openCamera(camera.current!).then((stop) => cleanups.push(stop)).catch((e) => setProblem(`Camera: ${e.message}`));
    openMic((pcm) => {
      // send silence while the coach talks so it doesn't hear itself, the stream must stay real time
      if (socket.readyState === WebSocket.OPEN) socket.send(v.speaking ? new ArrayBuffer(pcm.byteLength) : pcm);
    }).then((stop) => cleanups.push(stop)).catch((e) => setProblem(`Microphone: ${e.message}`));

    const sample = window.setInterval(async () => {
      const cam = camera.current;
      if (!cam?.videoWidth || socket.readyState !== WebSocket.OPEN) return;
      const images: string[] = [];
      for (let i = 0; i < 3; i++) {
        images.push(grabFrame(cam));
        if (i < 2) await new Promise((r) => setTimeout(r, FRAME_GAP_MS));
      }
      socket.send(JSON.stringify({ type: "frames", images } satisfies ClientMsg));
    }, CHECK_EVERY_MS);

    return () => {
      clearInterval(sample);
      clearTimeout(highlightTimer);
      v.stop();
      socket.close(1000);
      cleanups.forEach((f) => f());
    };
  }, [id]);

  // the tutorial waits for you at the end of each step
  const onTime = () => {
    const p = player.current, s = stepRef.current;
    if (p && s && !p.paused && p.currentTime >= s.end_s) { p.pause(); setWaiting(true); }
  };
  const replay = () => {
    const p = player.current, s = stepRef.current;
    if (p && s) { p.currentTime = s.start_s; void p.play(); setWaiting(false); }
  };

  const total = tutorial.steps.length;
  return (
    <main className={`coach ${highlight ? "focus-camera" : ""}`}>
      <section className="stage-area">
        <div className="player">
          <video ref={player} src={`/media/${id}/tutorial.mp4`} playsInline onTimeUpdate={onTime} />
          {waiting && <button className="your-turn" onClick={replay}>Your turn · <u>watch again</u></button>}
        </div>
        {/* sized to the camera's own aspect ratio so SAM boxes map 1:1 as percentages */}
        <div className="camera" style={{ aspectRatio: aspect, "--ar": aspect } as React.CSSProperties}>
          <video ref={camera} playsInline muted onLoadedMetadata={(e) => setAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight)} />
          {highlight?.box && (
            <div className="box" style={{
              left: `${(highlight.box.x1 / highlight.box.w) * 100}%`,
              top: `${(highlight.box.y1 / highlight.box.h) * 100}%`,
              width: `${((highlight.box.x2 - highlight.box.x1) / highlight.box.w) * 100}%`,
              height: `${((highlight.box.y2 - highlight.box.y1) / highlight.box.h) * 100}%`,
            }}><span>{highlight.label}</span></div>
          )}
          {verdict && <span className={`pill ${verdict.v.status}`}>{verdict.v.status.replace("_", " ")} · {(verdict.ms / 1000).toFixed(1)} s</span>}
        </div>
      </section>

      <section className="step-card" aria-live="polite">
        <div className="count"><b>{String(index + 1).padStart(2, "0")}</b><span>/{String(total).padStart(2, "0")}</span></div>
        <div className="progress">{tutorial.steps.map((s) => <i key={s.id} className={s.id < index ? "done" : s.id === index ? "now" : ""} />)}</div>
        {finished ? <h2>Done! Enjoy.</h2> : <h2>{step?.instruction ?? "Getting ready…"}</h2>}
        {step && step.quantities.length > 0 && <p className="chips">{step.quantities.map((q) => <span key={q}>{q}</span>)}</p>}
        {step?.timer_s && <Timer key={step.id} seconds={step.timer_s} onDone={() => voice.current?.say("Time's up!", true)} />}
        {step?.irreversible && <p className="warn">No going back after this one: the coach checks first.</p>}
      </section>

      {line && <p className={`coach-line ${line.urgent ? "urgent" : ""}`}>{line.text}</p>}
      {problem && <p className="error" role="alert">{problem}</p>}

      <nav className="controls">
        <button onClick={() => command("back")} aria-label="Previous step">Back</button>
        <button onClick={() => command("repeat")}>Repeat</button>
        <button className="primary" onClick={() => command("done")}>Done</button>
      </nav>
      <p className="heard"><span className="dot" aria-hidden /> {heard ? `“${heard}”` : "Listening: say next, repeat, done, or ask a question"}</p>
      <button className="exit" onClick={onExit}>Exit</button>
    </main>
  );
}

function Timer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null) return;
    if (left <= 0) return onDone();
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <button className="timer" onClick={() => setLeft(left === null ? seconds : null)}>
      {left === null ? `Start ${clock(seconds)} timer` : `${clock(left)} · tap to stop`}
    </button>
  );
}
