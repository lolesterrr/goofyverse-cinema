import { useStore } from "../store.jsx";
import { fmtWhen } from "../lib/dates.js";
import { toFilm } from "../lib/tmdb.js";
import KindBadge from "./KindBadge.jsx";
import Poster from "./Poster.jsx";

// A watchlist film drawn as a ticket stub.
export default function Ticket({ item, seenBy = [], night = null, actions = null }) {
  const { openModal } = useStore();
  return (
    <article className="ticket">
      <div className="ticket-main">
        <button type="button" className="ticket-film" onClick={() => openModal("film", { film: toFilm(item) })}>
          <Poster path={item.poster} title={item.title} size="w154" className="thumb" />
          <span className="ticket-text">
            <strong className="display">{item.title}</strong>
            {item.year && <span className="muted">{item.year}</span>}
            <KindBadge film={item} />
          </span>
        </button>
        <p className="muted small-text">
          added by {item.addedBy}
          {item.note ? ` · “${item.note}”` : ""}
        </p>
        <div className="chips">
          {night && <span className="badge gold-badge">Night: {fmtWhen(night.when)}</span>}
          {seenBy.map((p) => (
            <span key={p} className="badge">
              {p} has seen it
            </span>
          ))}
        </div>
        {actions}
      </div>
      <div className="ticket-stub" aria-hidden="true">
        ADMIT
      </div>
    </article>
  );
}
