import { useStore } from "../store.jsx";
import { countdown, fmtWhen } from "../lib/dates.js";
import { explain } from "../lib/errors.js";
import { useNow } from "../lib/hooks.js";
import { toFilm } from "../lib/tmdb.js";
import Loaded from "../components/Loaded.jsx";
import { Empty, Marquee } from "../components/Layout.jsx";
import NightCard from "../components/NightCard.jsx";
import Poster from "../components/Poster.jsx";

function PastNight({ night }) {
  const { saveNight, removeNight, openModal, say } = useStore();
  const happened = night.status === "done";

  async function markDone() {
    try {
      await saveNight({ ...night, status: "done" }, { quiet: true });
      openModal("log", { film: toFilm(night), together: true });
    } catch (e) {
      say(explain(e), "shrug");
    }
  }

  async function drop() {
    if (!window.confirm(`Delete the night for ${night.title}?`)) return;
    try {
      await removeNight(night.id);
    } catch (e) {
      say(explain(e), "shrug");
    }
  }

  return (
    <li className="entry-row">
      <Poster path={night.poster} title={night.title} size="w92" className="thumb" />
      <div className="grow">
        <strong className="display">{night.title}</strong>
        <div className="muted small-text">
          {fmtWhen(night.when)}
          {night.place ? ` · ${night.place}` : ""}
        </div>
        <span className={`badge ${happened ? "gold-badge" : ""}`}>{happened ? "Watched together" : "Did it happen?"}</span>
      </div>
      <div className="row wrap">
        {happened ? (
          <button type="button" className="btn ghost small" onClick={() => openModal("log", { film: toFilm(night), together: true })}>
            Log it
          </button>
        ) : (
          <button type="button" className="btn small" onClick={markDone}>
            We watched it
          </button>
        )}
        <button type="button" className="link-btn" onClick={drop}>
          Delete
        </button>
      </div>
    </li>
  );
}

function NightsBody({ data }) {
  const { openModal } = useStore();
  const now = useNow();
  const upcoming = data.nights
    .filter((n) => n.status !== "done" && countdown(n.when, now).state !== "past")
    .sort((a, b) => a.when.localeCompare(b.when));
  const past = data.nights.filter((n) => !upcoming.includes(n)).sort((a, b) => b.when.localeCompare(a.when));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Movie night</h1>
        <button type="button" className="btn" onClick={() => openModal("night")}>
          Plan a night
        </button>
      </div>

      {upcoming.length === 0 ? (
        <Empty
          anim="popcorn"
          action={
            <button type="button" className="btn" onClick={() => openModal("night")}>
              Plan a night
            </button>
          }
        >
          No night on the calendar. Pick a film from the queue and put a date on it.
        </Empty>
      ) : (
        upcoming.map((n, i) =>
          i === 0 ? (
            <Marquee key={n.id}>
              <NightCard night={n} profiles={data.profiles} now={now} />
            </Marquee>
          ) : (
            <div key={n.id} className="panel">
              <NightCard night={n} profiles={data.profiles} now={now} headline="COMING UP" />
            </div>
          ),
        )
      )}

      {past.length > 0 && (
        <section className="section">
          <h2>Past nights</h2>
          <ul className="entries">
            {past.map((n) => (
              <PastNight key={n.id} night={n} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function Nights() {
  return <Loaded>{(data) => <NightsBody data={data} />}</Loaded>;
}
