import { useState } from "react";
import { useStore } from "../store.jsx";
import { ratedLatest, profileStats, tasteMatch, yearsIn } from "../lib/taste.js";
import { filmKey, toFilm } from "../lib/tmdb.js";
import Loaded from "../components/Loaded.jsx";
import { Empty } from "../components/Layout.jsx";
import Pierre from "../components/Pierre.jsx";
import KindBadge from "../components/KindBadge.jsx";
import Poster from "../components/Poster.jsx";
import { Stars } from "../components/Stars.jsx";

function Histogram({ stats }) {
  const max = Math.max(1, ...stats.histogram.map((h) => h.count));
  const summary = stats.histogram.filter((h) => h.count).map((h) => `${h.count} at ${h.stars}`).join(", ") || "no ratings";
  return (
    <div className="histogram" role="img" aria-label={`Ratings: ${summary}`}>
      {stats.histogram.map((h) => (
        <div key={h.stars} className="bar" style={{ height: `${(h.count / max) * 100}%` }} title={`${h.stars} stars: ${h.count}`} />
      ))}
    </div>
  );
}

function StatsColumn({ name, stats }) {
  return (
    <div className="panel stats">
      <h3>{name}</h3>
      <dl className="stat-grid">
        <div><dt>Titles</dt><dd>{stats.films}</dd></div>
        <div><dt>Logs</dt><dd>{stats.logs}</dd></div>
        <div><dt>Average</dt><dd>{stats.avg == null ? "–" : stats.avg}</dd></div>
        <div><dt>Hours</dt><dd>{stats.hours}</dd></div>
      </dl>
      <p className="small-text muted">
        {stats.byKind.movie} film{stats.byKind.movie === 1 ? "" : "s"} · {stats.byKind.series} series · {stats.byKind.anime} anime
      </p>
      <p className="eyebrow">Ratings</p>
      <Histogram stats={stats} />
      {stats.topGenres.length > 0 && (
        <p className="small-text">
          <span className="muted">Most watched: </span>
          {stats.topGenres.map((g) => `${g.name} (${g.count})`).join(", ")}
        </p>
      )}
      {stats.top.length > 0 && (
        <ul className="top-list">
          {stats.top.map((e) => (
            <li key={e.id}>
              {e.title} <Stars value={e.rating} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UsBody({ data }) {
  const { me, openModal } = useStore();
  const profiles = data.profiles;
  const [a, setA] = useState(me);
  const [b, setB] = useState(profiles.find((p) => p !== me) || me);
  const [year, setYear] = useState(new Date().getFullYear());
  const [stamped, setStamped] = useState(() => new Set());
  const years = yearsIn(Object.values(data.diary));

  const taste = tasteMatch(data.diary[a], data.diary[b]);
  const mood = taste.percent == null ? "think" : taste.percent >= 75 ? "happy" : taste.percent >= 45 ? "shrug" : "sad";

  const complaints = profiles.flatMap((p) =>
    [...ratedLatest(data.diary[p]).values()].filter((e) => e.rating <= 2).map((entry) => ({ who: p, entry })),
  );
  const togetherFilms = new Set(
    Object.values(data.diary)
      .flat()
      .filter((e) => e.together && e.watchedOn.startsWith(String(year)))
      .map(filmKey),
  ).size;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Us</h1>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Taste match</h2>
          {profiles.length > 2 && (
            <span className="row">
              <label className="inline-field">
                <span className="sr-only">First person</span>
                <select value={a} onChange={(e) => setA(e.target.value)}>
                  {profiles.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <span className="muted">and</span>
              <label className="inline-field">
                <span className="sr-only">Second person</span>
                <select value={b} onChange={(e) => setB(e.target.value)}>
                  {profiles.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
            </span>
          )}
        </div>
        {a === b ? (
          <Empty anim="think">Pick two different people.</Empty>
        ) : taste.total === 0 ? (
          <Empty anim="think">
            {a} and {b} haven't rated the same title yet. Rate one you both saw and I'll do the maths.
          </Empty>
        ) : (
          <>
            <div className="panel taste-big">
              <Pierre anim={mood} scale={5} />
              <div className="grow">
                <div className="taste-pct">{taste.percent}%</div>
                <div className="meter" aria-hidden="true">
                  <div style={{ width: `${taste.percent}%` }} />
                </div>
                <p>
                  {a} and {b} agree, within half a star, on <strong>{taste.agreeCount}</strong> of <strong>{taste.total}</strong> shared titles.
                </p>
                {taste.fight && (
                  <p className="muted">
                    Biggest fight: <strong>{taste.fight.title}</strong>, {taste.fight.a}★ against {taste.fight.b}★.
                  </p>
                )}
              </div>
            </div>
            <table className="shared-table">
              <caption className="sr-only">Films {a} and {b} both rated</caption>
              <thead>
                <tr><th scope="col">Film</th><th scope="col">{a}</th><th scope="col">{b}</th><th scope="col">Gap</th></tr>
              </thead>
              <tbody>
                {taste.shared.map((f) => (
                  <tr key={f.key}>
                    <td>
                      <button type="button" className="prog-film" onClick={() => openModal("film", { film: toFilm(f) })}>
                        <Poster path={f.poster} title={f.title} size="w92" className="thumb small-thumb" />
                        <span>{f.title} {f.year && <span className="muted">{f.year}</span>} <KindBadge film={f} /></span>
                      </button>
                    </td>
                    <td><Stars value={f.a} /></td>
                    <td><Stars value={f.b} /></td>
                    <td className={f.diff >= 1.5 ? "gold" : "muted"}>{f.diff === 0 ? "same" : `${f.diff}★`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Year in review</h2>
          <label className="inline-field">
            <span className="sr-only">Year</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <p className="muted">
          {togetherFilms === 0 ? "Nothing watched together in " : `${togetherFilms} title${togetherFilms === 1 ? "" : "s"} watched together in `}
          {year}.
        </p>
        <div className="stats-grid">
          {profiles.map((p) => (
            <StatsColumn key={p} name={p} stats={profileStats(data.diary[p], year)} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Complaint desk</h2>
        </div>
        {complaints.length === 0 ? (
          <Empty anim="sleep">No complaints. Nothing here scored two stars or less.</Empty>
        ) : (
          <>
            <div className="desk">
              <Pierre anim={stamped.size ? "stamp" : "read"} scale={4} />
              <p className="muted">Anything rated two stars or less lands here. Pierre reads each complaint carefully and stamps it.</p>
            </div>
            <ul className="entries">
              {complaints.map(({ who, entry }) => {
                const key = `${who}-${entry.id}`;
                const filed = stamped.has(key);
                return (
                  <li key={key} className="entry-row">
                    <Poster path={entry.poster} title={entry.title} size="w92" className="thumb" />
                    <div className="grow">
                      <strong className="display">{entry.title}</strong> {entry.year && <span className="muted">{entry.year}</span>}
                      <div>
                        <strong className="gold">{who}</strong> <Stars value={entry.rating} />
                      </div>
                      {entry.review && <p className="review clamp">{entry.review}</p>}
                    </div>
                    {filed ? (
                      <span className="stamp">COMPLAINT FILED</span>
                    ) : (
                      <button type="button" className="btn ghost small" onClick={() => setStamped(new Set(stamped).add(key))}>
                        Stamp it
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

export default function Us() {
  return <Loaded>{(data) => <UsBody data={data} />}</Loaded>;
}
