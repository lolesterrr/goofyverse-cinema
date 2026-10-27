import { useMemo, useState } from "react";
import { useStore } from "../store.jsx";
import { fmtDay } from "../lib/dates.js";
import { groupByFilm, yearsIn } from "../lib/taste.js";
import { KINDS, kindOf, toFilm } from "../lib/tmdb.js";
import Loaded from "../components/Loaded.jsx";
import { Empty } from "../components/Layout.jsx";
import KindBadge, { seasonLabel } from "../components/KindBadge.jsx";
import Poster from "../components/Poster.jsx";
import Programme from "../components/Programme.jsx";
import { Stars } from "../components/Stars.jsx";

function monthLabel(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function EntryRow({ entry, mine }) {
  const { openModal } = useStore();
  return (
    <li className="entry-row">
      <button type="button" className="prog-film" onClick={() => openModal("film", { film: toFilm(entry) })}>
        <Poster path={entry.poster} title={entry.title} size="w92" className="thumb" />
      </button>
      <div className="grow">
        <div>
          <strong className="display">{entry.title}</strong> {entry.year && <span className="muted">{entry.year}</span>}{" "}
          <KindBadge film={entry} /> <Stars value={entry.rating} />
        </div>
        <div className="chips">
          <span className="muted small-text">{[seasonLabel(entry), fmtDay(entry.watchedOn)].filter(Boolean).join(" · ")}</span>
          {entry.together && <span className="badge gold-badge">Together</span>}
          {entry.rewatch && <span className="badge">Rewatch</span>}
        </div>
        {entry.review && <p className="review">{entry.review}</p>}
      </div>
      {mine && (
        <button type="button" className="btn ghost small" onClick={() => openModal("log", { entry })}>
          Edit
        </button>
      )}
    </li>
  );
}

function DiaryBody({ data }) {
  const { me, openModal } = useStore();
  const profiles = data.profiles;
  const [who, setWho] = useState("all");
  const [year, setYear] = useState("all");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const years = useMemo(() => yearsIn(Object.values(data.diary)), [data.diary]);
  const term = q.trim().toLowerCase();

  const keep = (e) =>
    (year === "all" || e.watchedOn.startsWith(year)) && (kind === "all" || kindOf(e) === kind) && (!term || e.title.toLowerCase().includes(term));

  const filteredDiary = useMemo(
    () => Object.fromEntries(Object.entries(data.diary).map(([p, list]) => [p, list.filter(keep)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.diary, year, term, kind],
  );

  const everyone = who === "all";
  const groups = everyone ? groupByFilm(filteredDiary) : [];
  const personal = everyone
    ? []
    : (filteredDiary[who] || []).slice().sort((a, b) => `${b.watchedOn}${b.createdAt}`.localeCompare(`${a.watchedOn}${a.createdAt}`));
  const months = [];
  for (const e of personal) {
    const label = monthLabel(e.watchedOn);
    const last = months[months.length - 1];
    if (last && last.label === label) last.items.push(e);
    else months.push({ label, items: [e] });
  }
  const total = Object.values(data.diary).reduce((n, l) => n + l.length, 0);
  const shown = everyone ? groups.length : personal.length;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Diary</h1>
        <button type="button" className="btn" onClick={() => openModal("log")}>
          Log something
        </button>
      </div>

      <div className="filters">
        <div className="chips" role="group" aria-label="Whose diary">
          <button type="button" className="chip" aria-pressed={everyone} onClick={() => setWho("all")}>
            Everyone
          </button>
          {profiles.map((p) => (
            <button key={p} type="button" className="chip" aria-pressed={who === p} onClick={() => setWho(p)}>
              {p}
              {p === me ? " (you)" : ""}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Show only">
          <button type="button" className="chip" aria-pressed={kind === "all"} onClick={() => setKind("all")}>
            All kinds
          </button>
          {KINDS.map((k) => (
            <button key={k.id} type="button" className="chip" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
              {k.plural}
            </button>
          ))}
        </div>
        <label className="inline-field">
          <span className="sr-only">Year</span>
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field grow">
          <span className="sr-only">Search the diary</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles" />
        </label>
      </div>

      {total === 0 ? (
        <Empty
          action={
            <button type="button" className="btn" onClick={() => openModal("log")}>
              Log your first film
            </button>
          }
        >
          The diary is empty. Log what you watched and say what you thought.
        </Empty>
      ) : shown === 0 ? (
        <Empty anim="search">Nothing matches that.</Empty>
      ) : everyone ? (
        <Programme groups={groups} profiles={profiles} />
      ) : (
        months.map((m) => (
          <section key={m.label} className="section">
            <h2 className="month">{m.label}</h2>
            <ul className="entries">
              {m.items.map((e) => (
                <EntryRow key={e.id} entry={e} mine={who === me} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export default function Diary() {
  return <Loaded>{(data) => <DiaryBody data={data} />}</Loaded>;
}
