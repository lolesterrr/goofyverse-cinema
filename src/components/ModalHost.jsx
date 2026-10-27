import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useStore } from "../store.jsx";
import { explain } from "../lib/errors.js";
import { fmtDay } from "../lib/dates.js";
import { backdropUrl, filmKey, toFilm } from "../lib/tmdb.js";
import FilmPicker from "./FilmPicker.jsx";
import KindBadge, { seasonLabel } from "./KindBadge.jsx";
import Modal from "./Modal.jsx";
import Poster from "./Poster.jsx";
import { Stars } from "./Stars.jsx";
import { JazzForm, LogForm, NightForm } from "./forms.jsx";

function FilmDetails({ film }) {
  const { data, addToWatchlist, openModal, say } = useStore();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .details(film)
      .then((d) => alive && setInfo(d))
      .catch((e) => alive && setErr(e));
    return () => {
      alive = false;
    };
  }, [film.tmdbId, film.media]);

  const stored = toFilm(info || film);
  const logs = data
    ? Object.entries(data.diary)
        .map(([profile, list]) => ({
          profile,
          entry: list
            .filter((e) => filmKey(e) === filmKey(film))
            .sort((a, b) => `${b.watchedOn}${b.createdAt}`.localeCompare(`${a.watchedOn}${a.createdAt}`))[0],
        }))
        .filter((x) => x.entry)
    : [];
  const onList = Boolean(data && data.watchlist.some((w) => filmKey(w) === filmKey(film)));
  const backdrop = info && backdropUrl(info.backdrop);

  async function queue() {
    try {
      await addToWatchlist(stored);
    } catch (e) {
      say(explain(e), "shrug");
    }
  }

  return (
    <div className="film-details">
      {backdrop && <img className="backdrop" src={backdrop} alt="" loading="lazy" />}
      <div className="film-body">
        <Poster path={film.poster} title={film.title} className="film-poster" />
        <div className="grow">
          <h3 className="film-title">
            {film.title} {film.year && <span className="muted">({film.year})</span>} <KindBadge film={stored} />
          </h3>
          {info?.tagline && <p className="muted italic">{info.tagline}</p>}
          <p className="muted">
            {[
              info?.directors?.length ? `Directed by ${info.directors.join(", ")}` : null,
              info?.creators?.length ? `Created by ${info.creators.join(", ")}` : null,
              info?.seasons ? `${info.seasons} season${info.seasons === 1 ? "" : "s"}` : null,
              stored.runtime ? `${stored.runtime} min` : null,
              stored.genres.join(", ") || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {info?.overview && <p>{info.overview}</p>}
          {err && <p className="notice">{explain(err)}</p>}
        </div>
      </div>

      {logs.length > 0 && (
        <ul className="take-list">
          {logs.map(({ profile, entry }) => (
            <li key={profile}>
              <strong>{profile}</strong> <Stars value={entry.rating} />{" "}
              <span className="muted">
                {seasonLabel(entry) && `${seasonLabel(entry)} · `}
                {fmtDay(entry.watchedOn)}
              </span>
              {entry.review && <p className="review">{entry.review}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="form-actions">
        <span className="grow" />
        {!onList && (
          <button type="button" className="btn ghost" onClick={queue}>
            Add to the queue
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => openModal("night", { film: stored })}>
          Plan a night
        </button>
        <button type="button" className="btn" onClick={() => openModal("log", { film: stored })}>
          Log it
        </button>
      </div>
    </div>
  );
}

function QueueAdd({ onClose }) {
  const { addToWatchlist, say } = useStore();
  async function pick(film) {
    try {
      await addToWatchlist(film);
      onClose();
    } catch (e) {
      say(explain(e), "shrug");
    }
  }
  return <FilmPicker onPick={pick} onCancel={onClose} />;
}

export default function ModalHost() {
  const { modal, closeModal } = useStore();
  if (!modal) return null;
  const { type, props } = modal;
  const key = `${type}-${props.entry?.id || props.night?.id || (props.film ? filmKey(props.film) : "new")}`;

  if (type === "queue") {
    return (
      <Modal key={key} title="Add to the queue" onClose={closeModal}>
        <QueueAdd onClose={closeModal} />
      </Modal>
    );
  }

  if (type === "log") {
    return (
      <Modal key={key} title={props.entry ? "Edit your log" : "Log something"} onClose={closeModal}>
        <LogForm {...props} onClose={closeModal} />
      </Modal>
    );
  }
  if (type === "night") {
    return (
      <Modal key={key} title={props.night ? "Edit the night" : "Plan a movie night"} onClose={closeModal}>
        <NightForm {...props} onClose={closeModal} />
      </Modal>
    );
  }
  if (type === "jazz") {
    return (
      <Modal key={key} title={props.entry ? "Edit the entry" : "Add to the Jazz shelf"} onClose={closeModal}>
        <JazzForm {...props} onClose={closeModal} />
      </Modal>
    );
  }
  if (type === "film") {
    return (
      <Modal key={key} title="Details" onClose={closeModal} wide>
        <FilmDetails film={props.film} />
      </Modal>
    );
  }
  return null;
}
