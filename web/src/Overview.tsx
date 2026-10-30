import type { Tutorial } from "../../shared/contracts.ts";
import { clock } from "./time.ts";

export function Overview({ id, tutorial, onStart }: { id: string; tutorial: Tutorial; onStart: () => void }) {
  return (
    <main className="overview">
      <a className="back" href="#">← New tutorial</a>
      <p className="kicker">{tutorial.steps.length} steps</p>
      <h1 className="display">{tutorial.title}</h1>
      <button className="btn primary start" onClick={onStart}>Start cooking</button>
      <p className="muted">The coach needs your camera and microphone. Nothing is recorded.</p>

      <ol className="steps">
        {tutorial.steps.map((s) => (
          <li key={s.id}>
            <img src={`/media/${id}/ref/${s.id}.jpg`} alt="" loading="lazy" />
            <div>
              <span className="when">{clock(s.start_s)}{s.timer_s ? ` · wait ${clock(s.timer_s)}` : ""}{s.irreversible ? " · no going back" : ""}</span>
              <p>{s.instruction}</p>
              {s.quantities.length > 0 && <p className="qty">{s.quantities.join(" · ")}</p>}
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
