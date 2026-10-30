import { useEffect, useState } from "react";
import type { TutorialStatus } from "../../shared/contracts.ts";
import { Coach } from "./Coach.tsx";
import { Overview } from "./Overview.tsx";
import { Upload } from "./Upload.tsx";

const idFromHash = () => location.hash.match(/^#\/t\/([a-z0-9-]+)/)?.[1] ?? null;

export function App() {
  const [id, setId] = useState(idFromHash);
  useEffect(() => {
    const onHash = () => setId(idFromHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  return id ? <Tutorial id={id} key={id} /> : <Upload onUploaded={(newId) => (location.hash = `#/t/${newId}`)} />;
}

function Tutorial({ id }: { id: string }) {
  const [status, setStatus] = useState<TutorialStatus | null>(null);
  const [cooking, setCooking] = useState(false);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      const res = await fetch(`/api/tutorials/${id}`);
      const s: TutorialStatus | { error: string } = await res.json();
      if (stop) return;
      if ("error" in s) return setStatus({ state: "failed", error: s.error });
      setStatus(s);
      if (s.state === "processing") setTimeout(poll, 2000);
    };
    poll().catch((e) => setStatus({ state: "failed", error: String(e) }));
    return () => { stop = true; };
  }, [id]);

  if (!status) return <main className="center"><p className="muted">Loading…</p></main>;
  if (status.state === "processing") return <Preparing stage={status.stage} />;
  if (status.state === "failed") {
    return (
      <main className="center">
        <h1 className="display">That didn't work</h1>
        <p className="muted">{status.error}</p>
        <a className="btn" href="#">Try another video</a>
      </main>
    );
  }
  return cooking
    ? <Coach id={id} tutorial={status.tutorial} onExit={() => setCooking(false)} />
    : <Overview id={id} tutorial={status.tutorial} onStart={() => {
        speechSynthesis.speak(new SpeechSynthesisUtterance("")); // mobile only allows speech after a tap
        setCooking(true);
      }} />;
}

function Preparing({ stage }: { stage: string }) {
  return (
    <main className="center preparing">
      <div className="pot" aria-hidden><span /><span /><span /></div>
      <h1 className="display">Reading your tutorial</h1>
      <p className="stage">{stage}…</p>
      <p className="muted">About a minute per 5 minutes of video. Keep this page open.</p>
    </main>
  );
}
