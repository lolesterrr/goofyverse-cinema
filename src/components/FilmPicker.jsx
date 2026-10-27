import { useEffect, useState } from "react";
import { api } from "../api.js";
import { explain } from "../lib/errors.js";
import { toFilm } from "../lib/tmdb.js";
import Pierre from "./Pierre.jsx";
import Poster from "./Poster.jsx";

// Search TMDB through the worker (the key never reaches the browser).
export default function FilmPicker({ onPick, onCancel }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [err, setErr] = useState(null);
  const [fetching, setFetching] = useState(null);

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
    setFetching(hit.tmdbId);
    try {
      onPick(toFilm(await api.movie(hit.tmdbId))); // full details: genres and runtime
    } catch {
      onPick(toFilm(hit));
    }
  }

  return (
    <div className="picker">
      <div className="picker-bar">
        <Pierre anim={state === "error" ? "shrug" : "search"} scale={2} />
        <label className="grow">
          <span className="sr-only">Search for a film</span>
          <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a film" maxLength={100} />
        </label>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {state === "error" && <p className="notice" role="alert">{explain(err)}</p>}
      {state === "loading" && <p className="muted">Looking…</p>}
      {state === "ready" && results.length === 0 && <p className="muted">Nothing found. Try another spelling.</p>}
      {state === "ready" && !q.trim() && results.length > 0 && <p className="eyebrow">Trending this week</p>}

      <ul className="picker-list">
        {state !== "error" &&
          results.map((hit) => (
            <li key={hit.tmdbId}>
              <button type="button" className="picker-row" onClick={() => choose(hit)} disabled={fetching !== null}>
                <Poster path={hit.poster} title={hit.title} size="w92" className="thumb" />
                <span className="picker-text">
                  <strong>
                    {hit.title} {hit.year && <span className="muted">({hit.year})</span>}
                  </strong>
                  {hit.overview && <span className="muted clamp">{hit.overview}</span>}
                </span>
                {fetching === hit.tmdbId && <span className="muted">…</span>}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
