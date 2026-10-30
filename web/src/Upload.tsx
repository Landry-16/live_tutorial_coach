import { useState } from "react";

export function Upload({ onUploaded }: { onUploaded: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function send(file: File | undefined) {
    if (!file) return;
    if (file.type !== "video/mp4") return setError("Pick an .mp4 video.");
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("video", file);
    try {
      const res = await fetch("/api/tutorials", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      onUploaded(json.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="home">
      <header className="hero">
        <p className="kicker">Live Tutorial Coach</p>
        <h1 className="display">
          Tutorials only go one way.<br />
          <em>This one watches you back.</em>
        </h1>
        <p className="lede">
          Drop a cooking video. Prop your phone up. The coach reads each step aloud, plays the matching part of the video at
          your pace, and stops you before a mistake you can't undo.
        </p>
      </header>

      <label
        className={`drop ${drag ? "drag" : ""} ${busy ? "busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void send(e.dataTransfer.files[0]); }}
      >
        <input type="file" accept="video/mp4" disabled={busy} onChange={(e) => void send(e.target.files?.[0])} />
        <span className="drop-big">{busy ? "Uploading…" : "Choose a tutorial"}</span>
        <span className="muted">.mp4, up to 1 GB</span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}

      <ol className="how">
        <li><span><b>Upload</b> the tutorial, it gets split into steps.</span></li>
        <li><span><b>Prop</b> your phone so the camera sees your worktop.</span></li>
        <li><span><b>Cook.</b> Say "next", "repeat", "done", or ask a question.</span></li>
      </ol>
    </main>
  );
}
