import { useEffect, useState } from "react";
import { api } from "../api.js";
import { explain } from "../lib/errors.js";
import { KINDS, filmKey, kindLabel, toFilm } from "../lib/tmdb.js";
import Pierre from "./Pierre.jsx";
import Poster from "./Poster.jsx";

// Search TMDB through the worker (the key never reaches the browser).
export default function FilmPicker({ onPick, onCancel }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [err, setErr] = useState(null);
  const [fetching, setFetching] = useState(null);
  const [kind, setKind] = useState("all");

  useEffect(() => {
    let alive = true;
    const term = q.trim();
    setState("loading");
    const timer = setTimeout(
      async () => {
        try {
          const r = term ? await api.search(term) : await api.trending();
          if (!alive) return;
          setResults(r.results);
          setState("ready");
        } catch (e) {
          if (!alive) return;
          setErr(e);
          setState("error");
        }
      },
      term ? 350 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  async function choose(hit) {
    setFetching(filmKey(hit));
    try {
      onPick(toFilm(await api.details(hit))); // full details: genres, runtime, anime or not
    } catch {
      onPick(toFilm(hit));
    }
  }

  const shown = results.filter((r) => kind === "all" || r.kind === kind);

  return (
    <div className="picker">
      <div className="picker-bar">
        <Pierre anim={state === "error" ? "shrug" : "search"} scale={2} />
        <label className="grow">
          <span className="sr-only">Search for a film, series or anime</span>
          <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search films, series, anime" maxLength={100} />
        </label>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="chips picker-kinds" role="group" aria-label="Show only">
        <button type="button" className="chip" aria-pressed={kind === "all"} onClick={() => setKind("all")}>
          All
        </button>
        {KINDS.map((k) => (
          <button key={k.id} type="button" className="chip" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.plural}
          </button>
        ))}
      </div>

      {state === "error" && <p className="notice" role="alert">{explain(err)}</p>}
      {state === "loading" && <p className="muted">Looking…</p>}
      {state === "ready" && shown.length === 0 && (
        <p className="muted">{results.length ? "Nothing of that kind in these results. Try All." : "Nothing found. Try another spelling."}</p>
      )}
      {state === "ready" && !q.trim() && shown.length > 0 && <p className="eyebrow">Trending this week</p>}

      <ul className="picker-list">
        {state !== "error" &&
          shown.map((hit) => (
            <li key={filmKey(hit)}>
              <button type="button" className="picker-row" onClick={() => choose(hit)} disabled={fetching !== null}>
                <Poster path={hit.poster} title={hit.title} size="w92" className="thumb" />
                <span className="picker-text">
                  <strong>
                    {hit.title} {hit.year && <span className="muted">({hit.year})</span>}{" "}
                    <span className={`badge kind-${hit.kind}`}>{kindLabel(hit)}</span>
                  </strong>
                  {hit.overview && <span className="muted clamp">{hit.overview}</span>}
                </span>
                {fetching === filmKey(hit) && <span className="muted">…</span>}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
