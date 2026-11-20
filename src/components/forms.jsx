import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useStore } from "../store.jsx";
import { explain } from "../lib/errors.js";
import { parseLink } from "../lib/embed.js";
import { MAX_FILES, checkFile, checkPrepared, coverOf, fmtSize, imagesOf, kindOfType, labelOf, prepare, wallOf } from "../lib/files.js";
import { Cancelled, uploadFile } from "../lib/upload.js";
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

function Actions({ busy, saveDisabled = false, onClose, saveLabel = "Save", onDelete, deleteLabel = "Delete" }) {
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
      <button type="submit" className="btn" disabled={busy || saveDisabled}>
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

const SLOTS = [
  ["cover", "Cover", coverOf],
  ["label", "Label", labelOf],
  ["wall", "Wallpaper", wallOf],
];

export function JazzForm({ entry, onClose }) {
  const { saveJazz, removeJazz } = useStore();
  const [title, setTitle] = useState(entry?.title || "");
  const [category, setCategory] = useState(entry?.category || "album");
  const [by, setBy] = useState(entry?.by || "");
  const [link, setLink] = useState(entry?.link || "");
  const [files, setFiles] = useState(entry?.files || []);
  const [art, setArt] = useState(entry?.art || {});
  const [pending, setPending] = useState([]); // names of files still going up
  const [fileErr, setFileErr] = useState("");
  const fresh = useRef(new Set()); // files uploaded during this edit
  const running = useRef(new Map()); // uploads in flight, so they can be cancelled
  const saved = useRef(false);
  const [rating, setRating] = useState(entry ? entry.rating : null);
  const [review, setReview] = useState(entry?.review || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Closing without saving shouldn't leave this edit's uploads behind.
  useEffect(
    () => () => {
      for (const controller of running.current.values()) controller.abort();
      if (saved.current) return;
      for (const key of fresh.current) api.delFile(key).catch(() => {});
    },
    [],
  );

  async function addFiles(list) {
    const picked = Array.from(list);
    setFileErr("");
    let count = files.length;
    for (const file of picked) {
      if (count >= MAX_FILES) {
        setFileErr(`Up to ${MAX_FILES} files per entry.`);
        break;
      }
      const problem = checkFile(file);
      if (problem) {
        setFileErr(problem);
        continue;
      }
      const id = `${file.name}-${Math.random()}`;
      const controller = new AbortController();
      running.current.set(id, controller);
      setPending((p) => [...p, { id, name: file.name, progress: null }]);
      try {
        const { blob, type } = await prepare(file);
        const tooBig = checkPrepared(blob, type, file.name);
        if (tooBig) throw Object.assign(new Error(tooBig), { code: "file-too-big", message: tooBig });
        const onProgress = (progress) => setPending((p) => p.map((x) => (x.id === id ? { ...x, progress } : x)));
        const meta = await uploadFile(blob, type, file.name, { onProgress, signal: controller.signal });
        fresh.current.add(meta.key);
        setFiles((f) => [...f, meta]);
        count += 1;
      } catch (error) {
        if (error instanceof Cancelled || error?.name === "AbortError") continue; // finally still runs
        setFileErr(error?.code === "file-too-big" && error.message !== "file-too-big" ? error.message : explain(error));
      } finally {
        running.current.delete(id);
        setPending((p) => p.filter((x) => x.id !== id));
      }
    }
  }

  // cover, label and wallpaper: click a job to give it to that photo, click again to take it back
  function toggleSlot(slot, f) {
    setArt((a) => ({ ...a, [slot]: a[slot] === f.key ? "" : f.key, ...(slot === "wall" ? { wallOff: false } : {}) }));
  }

  function removeFile(f) {
    setFiles((list) => list.filter((x) => x.key !== f.key));
    setArt((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== f.key)));
    if (fresh.current.has(f.key)) {
      fresh.current.delete(f.key);
      api.delFile(f.key).catch(() => {});
    }
  }

  const shape = { files, art };
  const photos = imagesOf(shape);

  async function submit(e) {
    e.preventDefault();
    if (pending.length) return;
    if (link.trim() && !parseLink(link)) {
      setErr("That link doesn't look right. It should start with https://");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await saveJazz({ ...(entry ? { id: entry.id, createdAt: entry.createdAt } : {}), title, category, by, link: link.trim(), files, art, rating, review });
      saved.current = true;
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
      <label className="field">
        <span className="label">Link (optional)</span>
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} placeholder="YouTube, Spotify or SoundCloud" />
      </label>
      <div className="field">
        <span className="label">Photos, music, video (optional)</span>
        <input
          type="file"
          multiple
          accept="image/*,audio/*,video/*,.mp3,.m4a,.flac,.wav,.ogg,.mp4,.mov,.webm"
          aria-label="Add photos, music or video"
          disabled={pending.length > 0 || files.length >= MAX_FILES}
          onChange={(e) => {
            const picked = e.target.files;
            if (picked && picked.length) addFiles(picked);
            e.target.value = "";
          }}
        />
        <span className="muted small-text">Up to {MAX_FILES} files. Photos are shrunk first. Songs up to 500 MB, videos up to 5 GB. Big files go up in pieces, so keep this page open until they finish.</span>
        {(files.length > 0 || pending.length > 0) && (
          <ul className="attach-list">
            {files.map((f) => {
              const isImage = kindOfType(f.type) === "image";
              const name = f.name || f.key.split("/")[1];
              return (
                <li key={f.key} className="attach-row">
                  <span className="attach-name">
                    {isImage ? "Photo" : kindOfType(f.type) === "video" ? "Video" : "Song"} · {name} · {fmtSize(f.size)}
                  </span>
                  <span className="row wrap attach-jobs">
                    {isImage &&
                      SLOTS.map(([slot, label, chosen]) => (
                        <button
                          key={slot}
                          type="button"
                          className="chip small"
                          aria-pressed={chosen(shape)?.key === f.key}
                          onClick={() => toggleSlot(slot, f)}
                          aria-label={`${label} for ${name}`}
                        >
                          {label}
                        </button>
                      ))}
                    <button type="button" className="link-btn" onClick={() => removeFile(f)} aria-label={`Remove ${name}`}>
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
            {pending.map((p) => (
              <li key={p.id} className="muted">
                <span className="attach-name">
                  Uploading {p.name}
                  {p.progress && p.progress.total > 1 ? `, piece ${Math.min(p.progress.done + 1, p.progress.total)} of ${p.progress.total}` : ""}…
                </span>
                <button type="button" className="link-btn" onClick={() => running.current.get(p.id)?.abort()} aria-label={`Cancel uploading ${p.name}`}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
        {photos.length > 0 && (
          <p className="muted small-text">
            The cover is shown whole, the label rides in the middle of the record, and the wallpaper sits blurred behind the card.{" "}
            <button type="button" className="link-btn" aria-pressed={Boolean(art.wallOff)} onClick={() => setArt((a) => ({ ...a, wallOff: !a.wallOff }))}>
              {art.wallOff ? "Turn the wallpaper back on" : "No wallpaper on this one"}
            </button>
          </p>
        )}
        {fileErr && <p className="notice" role="alert">{fileErr}</p>}
      </div>
      <div className="field">
        <span className="label">Your rating</span>
        <StarInput value={rating} onChange={setRating} label="Your rating" />
      </div>
      <label className="field">
        <span className="label">Review</span>
        <textarea rows={4} value={review} onChange={(e) => setReview(e.target.value)} maxLength={4000} />
      </label>
      {err && <p className="notice" role="alert">{err}</p>}
      <Actions busy={busy} saveDisabled={pending.length > 0} onClose={onClose} saveLabel={entry ? "Save changes" : "Put it on the shelf"} onDelete={entry ? del : null} deleteLabel="Delete entry" />
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
