import { useStore } from "../store.jsx";
import { toFilm } from "../lib/tmdb.js";
import Poster from "./Poster.jsx";
import { Stars } from "./Stars.jsx";

// Each film once, with everybody's take on it side by side.
export default function Programme({ groups, profiles }) {
  const { me, openModal } = useStore();
  return (
    <ul className="programme">
      {groups.map((g) => (
        <li key={g.tmdbId} className="prog-row">
          <button type="button" className="prog-film" onClick={() => openModal("film", { film: toFilm(g) })}>
            <Poster path={g.poster} title={g.title} size="w92" className="thumb" />
            <span>
              <strong className="display">{g.title}</strong> {g.year && <span className="muted">{g.year}</span>}
            </span>
          </button>
          <div className="prog-takes">
            {profiles.map((p) => {
              const e = g.byProfile[p];
              return (
                <div className="take" key={p}>
                  <div>
                    <strong className="gold">{p}</strong> {e ? <Stars value={e.rating} /> : <span className="muted">hasn't seen it</span>}
                  </div>
                  {e?.review && <p className="review clamp">{e.review}</p>}
                  {e && p === me && (
                    <button type="button" className="link-btn" onClick={() => openModal("log", { entry: e })}>
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
