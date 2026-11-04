import type { Tutorial } from "../../shared/contracts.ts";
import type { Stats } from "./Coach.tsx";

export function Finished({ id, tutorial, stats, onAgain }: { id: string; tutorial: Tutorial; stats: Stats; onAgain: () => void }) {
  const last = tutorial.steps.at(-1)!;
  return (
    <main className="finished">
      <div className="dither plate"><img src={`/media/${id}/ref/${last.id}.jpg`} alt="" /></div>
      <p className="kicker">Tutorial complete</p>
      <h1 className="display dot-end">You made it</h1>
      <p className="dish">{tutorial.title}</p>
      <dl className="stats">
        <div><dt>{tutorial.steps.length}</dt><dd>steps</dd></div>
        <div><dt>{stats.minutes}</dt><dd>{stats.minutes === 1 ? "minute" : "minutes"}</dd></div>
        <div><dt>{stats.interventions}</dt><dd>{stats.interventions === 1 ? "save by the coach" : "saves by the coach"}</dd></div>
      </dl>
      <div className="actions">
        <button className="btn primary" onClick={onAgain}>Do it again</button>
        <a className="btn" href="#">New tutorial</a>
      </div>
    </main>
  );
}
