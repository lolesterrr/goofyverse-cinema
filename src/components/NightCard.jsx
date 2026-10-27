import { useStore } from "../store.jsx";
import { countdown, fmtWhen } from "../lib/dates.js";
import { explain } from "../lib/errors.js";
import { toFilm } from "../lib/tmdb.js";
import Poster from "./Poster.jsx";
import Pierre from "./Pierre.jsx";

const STATUS = { in: "In", maybe: "Maybe", out: "Out" };

export function Rsvps({ night, profiles }) {
  const { me, rsvp, say } = useStore();
  async function set(status) {
    try {
      await rsvp(night.id, status);
    } catch (e) {
      say(explain(e), "shrug");
    }
  }
  return (
    <ul className="rsvps" aria-label="Who's coming">
      {profiles.map((p) => {
        const current = night.rsvp?.[p] || "maybe";
        if (p !== me) {
          return (
            <li key={p}>
              <strong>{p}</strong> <span className={`badge rsvp-${current}`}>{STATUS[current]}</span>
            </li>
          );
        }
        return (
          <li key={p}>
            <strong>{p} (you)</strong>
            <span className="segmented" role="group" aria-label="Your answer">
              {Object.entries(STATUS).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={current === value} onClick={() => set(value)}>
                  {label}
                </button>
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function NightCard({ night, profiles, now, headline = "NOW SHOWING, JUST FOR US" }) {
  const { saveNight, openModal, say } = useStore();
  const cd = countdown(night.when, now);

  async function watched() {
    try {
      await saveNight({ ...night, status: "done" }, { quiet: true });
      openModal("log", { film: toFilm(night), together: true });
    } catch (e) {
      say(explain(e), "shrug");
    }
  }

  return (
    <div className="night">
      <Pierre anim={cd.state === "now" ? "popcorn" : "ticket"} scale={6} />
      <Poster path={night.poster} title={night.title} size="w185" className="night-poster" />
      <div className="night-info">
        <span className="eyebrow gold">{headline}</span>
        <h3 className="night-title">{night.title}</h3>
        <p className="night-when">
          {fmtWhen(night.when)}
          {night.place ? ` · ${night.place}` : ""}
        </p>
        {night.note && <p className="muted">{night.note}</p>}
        <Rsvps night={night} profiles={profiles} />
        <div className="row wrap">
          <button type="button" className="btn small" onClick={watched}>
            We watched it
          </button>
          <button type="button" className="btn ghost small" onClick={() => openModal("night", { night })}>
            Edit
          </button>
        </div>
      </div>
      <div className="countdown" aria-label={`${cd.big} ${cd.unit}`}>
        <span className="eyebrow">{cd.state === "future" ? "Doors open in" : cd.state === "now" ? "On the screen" : "It was"}</span>
        <span className="countdown-big">{cd.big}</span>
        <span className="muted">{cd.unit}</span>
      </div>
    </div>
  );
}
