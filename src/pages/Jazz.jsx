import { useState } from "react";
import { useStore } from "../store.jsx";
import Loaded from "../components/Loaded.jsx";
import { Empty } from "../components/Layout.jsx";
import JazzCard from "../components/JazzCard.jsx";

function JazzBody({ data }) {
  const { me, openModal } = useStore();
  const [cat, setCat] = useState("all");
  const [who, setWho] = useState("all");
  const profiles = data.profiles;

  const all = profiles
    .flatMap((p) => (data.jazz[p] || []).map((entry) => ({ entry, who: p })))
    .sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt));
  const cats = [...new Set(all.map((x) => x.entry.category))].sort();
  const shown = all.filter((x) => (cat === "all" || x.entry.category === cat) && (who === "all" || x.who === who));

  return (
    <div className="page">
      <div className="page-head">
        <h1>The Jazz shelf</h1>
        <button type="button" className="btn" onClick={() => openModal("jazz")}>
          Add to the shelf
        </button>
      </div>
      <p className="muted">Everything that isn't a film: albums, anime, games, books, snacks. Rate it, say something, put it on the shelf.</p>

      {all.length > 0 && (
        <div className="filters">
          <div className="chips" role="group" aria-label="Filter by category">
            <button type="button" className="chip" aria-pressed={cat === "all"} onClick={() => setCat("all")}>
              All
            </button>
            {cats.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Filter by person">
            <button type="button" className="chip" aria-pressed={who === "all"} onClick={() => setWho("all")}>
              Everyone
            </button>
            {profiles.map((p) => (
              <button key={p} type="button" className="chip" aria-pressed={who === p} onClick={() => setWho(p)}>
                {p}
                {p === me ? " (you)" : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {all.length === 0 ? (
        <Empty
          anim="think"
          action={
            <button type="button" className="btn" onClick={() => openModal("jazz")}>
              Add the first thing
            </button>
          }
        >
          The shelf is bare. What have you been listening to, playing or reading?
        </Empty>
      ) : shown.length === 0 ? (
        <Empty anim="search">Nothing on the shelf matches that.</Empty>
      ) : (
        <div className="jazz-grid">
          {shown.map(({ entry, who: by }) => (
            <JazzCard key={entry.id} entry={entry} who={by} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Jazz() {
  return <Loaded>{(data) => <JazzBody data={data} />}</Loaded>;
}
