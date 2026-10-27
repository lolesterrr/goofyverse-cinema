import { useState } from "react";
import { useStore } from "../store.jsx";
import { explain } from "../lib/errors.js";
import { KINDS, kindOf, toFilm } from "../lib/tmdb.js";
import { defaultNightInput, fromLocalInput, todayStr, toLocalInput } from "../lib/dates.js";
import FilmPicker from "./FilmPicker.jsx";
import KindBadge from "./KindBadge.jsx";
import Poster from "./Poster.jsx";
import Pierre from "./Pierre.jsx";
import { StarInput } from "./Stars.jsx";

function FilmChip({ film, onChange }) {
  return (
    <div className="film-chip">
      <Poster path={film.poster} title={film.title} size="w92" className="thumb" />
      <div className="grow">
        <strong>{film.title}</strong> {film.year && <span className="muted">({film.year})</span>} <KindBadge film={film} />
      </div>
      {onChange && (
        <button type="button" className="btn ghost small" onClick={onChange}>
          Change title
        </button>
      )}
    </div>
  );
}

function Actions({ busy, onClose, saveLabel = "Save", onDelete, deleteLabel = "Delete" }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="form-actions">
      {onDelete &&
        (confirm ? (
          <button type="button" className="btn danger" onClick={onDelete} disabled={busy}>
            Really {deleteLabel.toLowerCase()}?
          </button>
        ) : (
          <button type="button" className="btn ghost danger-text" onClick={() => setConfirm(true)} disabled={busy}>
            {deleteLabel}
          </button>
        ))}
      <span className="grow" />
      <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

/* ---------- log a film ---------- */

export function LogForm({ entry, film: filmProp, together: togetherProp, onClose }) {
  const { saveDiary, removeDiary } = useStore();
  const [film, setFilm] = useState(entry ? toFilm(entry) : filmProp || null);
  const [picking, setPicking] = useState(!entry && !filmProp);
  const [rating, setRating] = useState(entry ? entry.rating : null);
  const [review, setReview] = useState(entry?.review || "");
  const [watchedOn, setWatchedOn] = useState(entry?.watchedOn || todayStr());
  const [together, setTogether] = useState(entry ? Boolean(entry.together) : Boolean(togetherProp));
  const [rewatch, setRewatch] = useState(Boolean(entry?.rewatch));
  const [kind, setKind] = useState(entry ? kindOf(entry) : null);
  const [season, setSeason] = useState(entry?.season ? String(entry.season) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (picking) {
    return (
      <FilmPicker
        onPick={(f) => {
          setFilm(f);
          setKind(kindOf(f));
          setPicking(false);
        }}
        onCancel={film ? () => setPicking(false) : onClose}
      />
    );
  }

  const isShow = film.media === "tv";
  const chosenKind = kind || kindOf(film);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await saveDiary({
        ...(entry ? { id: entry.id, createdAt: entry.createdAt } : {}),
        ...film,
        kind: chosenKind,
        season: isShow && season ? Number(season) : null,
        rating,
        review,
        watchedOn,
        together,
        rewatch,
      });
      onClose();
    } catch (error) {
      setErr(explain(error));
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      await removeDiary(entry.id);
      onClose();
    } catch (error) {
      setErr(explain(error));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <FilmChip film={film} onChange={entry ? null : () => setPicking(true)} />
      <div className="row wrap">
        <div className="field">
          <span className="label">Counts as</span>
          <div className="chips" role="group" aria-label="Counts as">
            {KINDS.filter((k) => isShow || k.id !== "series").map((k) => (
              <button key={k.id} type="button" className="chip" aria-pressed={chosenKind === k.id} onClick={() => setKind(k.id)}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
        {isShow && (
          <label className="field">
            <span className="label">Season (optional)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="Whole show"
            />
          </label>
        )}
      </div>
      <div className="field">
        <span className="label">Your rating</span>
        <StarInput value={rating} onChange={setRating} label="Your rating" />
      </div>
      <label className="field">
        <span className="label">Review</span>
        <textarea rows={5} value={review} onChange={(e) => setReview(e.target.value)} maxLength={4000} placeholder="Say what you thought. Spoilers are your problem." />
      </label>
      <div className="row wrap">
        <label className="field">
          <span className="label">Watched on</span>
          <input type="date" value={watchedOn} max={todayStr()} onChange={(e) => setWatchedOn(e.target.value)} required />
        </label>
        <label className="check">
          <input type="checkbox" checked={together} onChange={(e) => setTogether(e.target.checked)} /> Watched together
        </label>
        <label className="check">
          <input type="checkbox" checked={rewatch} onChange={(e) => setRewatch(e.target.checked)} /> Rewatch
        </label>
      </div>
      {err && <p className="notice" role="alert">{err}</p>}
      <Actions busy={busy} onClose={onClose} saveLabel={entry ? "Save changes" : "Log it"} onDelete={entry ? del : null} deleteLabel="Delete log" />
    </form>
  );
}

/* ---------- plan a movie night ---------- */

export function NightForm({ night, film: filmProp, onClose }) {
  const { saveNight, removeNight, data } = useStore();
  const [film, setFilm] = useState(night ? toFilm(night) : filmProp || null);
  const [picking, setPicking] = useState(!night && !filmProp);
  const [when, setWhen] = useState(night ? toLocalInput(night.when) : defaultNightInput());
  const [place, setPlace] = useState(night?.place || "");
  const [note, setNote] = useState(night?.note || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const queue = (data?.watchlist || []).slice(0, 6);

  if (picking) {
    return (
      <div>
        {queue.length > 0 && (
          <div className="queue-pick">
            <p className="eyebrow">From the queue</p>
            <div className="chips">
              {queue.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setFilm(toFilm(q));
                    setPicking(false);
                  }}
                >
                  {q.title}
                </button>
              ))}
            </div>
            <p className="eyebrow">Or search</p>
          </div>
        )}
        <FilmPicker
          onPick={(f) => {
            setFilm(f);
            setPicking(false);
          }}
          onCancel={film ? () => setPicking(false) : onClose}
        />
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await saveNight({ ...(night ? { id: night.id, status: night.status } : {}), ...film, when: fromLocalInput(when), place, note });
      onClose();
    } catch (error) {
      setErr(explain(error));
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      await removeNight(night.id);
      onClose();
    } catch (error) {
      setErr(explain(error));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <FilmChip film={film} onChange={() => setPicking(true)} />
      <label className="field">
        <span className="label">When (your local time)</span>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
      </label>
      <label className="field">
        <span className="label">Where</span>
        <input type="text" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} placeholder="My place, your place, a call" />
      </label>
      <label className="field">
        <span className="label">Note</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Snacks? Who picks the next one?" />
      </label>
      {err && <p className="notice" role="alert">{err}</p>}
      <Actions busy={busy} onClose={onClose} saveLabel={night ? "Save night" : "Book the night"} onDelete={night ? del : null} deleteLabel="Cancel night" />
    </form>
  );
}

/* ---------- the jazz shelf ---------- */

export const JAZZ_CATEGORIES = ["album", "track", "game", "book", "podcast", "food", "other"];

export function JazzForm({ entry, onClose }) {
  const { saveJazz, removeJazz } = useStore();
  const [title, setTitle] = useState(entry?.title || "");
  const [category, setCategory] = useState(entry?.category || "album");
  const [by, setBy] = useState(entry?.by || "");
  const [rating, setRating] = useState(entry ? entry.rating : null);
  const [review, setReview] = useState(entry?.review || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await saveJazz({ ...(entry ? { id: entry.id, createdAt: entry.createdAt } : {}), title, category, by, rating, review });
      onClose();
    } catch (error) {
      setErr(explain(error));
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      await removeJazz(entry.id);
      onClose();
    } catch (error) {
      setErr(explain(error));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="row wrap">
        <label className="field grow">
          <span className="label">What is it?</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="Kind of Blue" autoFocus />
        </label>
        <label className="field">
          <span className="label">Category</span>
          <input type="text" list="jazz-categories" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={30} required />
          <datalist id="jazz-categories">
            {JAZZ_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="field">
        <span className="label">By (artist, studio, author)</span>
        <input type="text" value={by} onChange={(e) => setBy(e.target.value)} maxLength={120} placeholder="Optional" />
      </label>
      <div className="field">
        <span className="label">Your rating</span>
        <StarInput value={rating} onChange={setRating} label="Your rating" />
      </div>
      <label className="field">
        <span className="label">Review</span>
        <textarea rows={4} value={review} onChange={(e) => setReview(e.target.value)} maxLength={4000} />
      </label>
      {err && <p className="notice" role="alert">{err}</p>}
      <Actions busy={busy} onClose={onClose} saveLabel={entry ? "Save changes" : "Put it on the shelf"} onDelete={entry ? del : null} deleteLabel="Delete entry" />
    </form>
  );
}

export function FormPierre({ anim = "clap" }) {
  return (
    <div className="form-pierre">
      <Pierre anim={anim} scale={3} />
    </div>
  );
}
