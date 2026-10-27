import { Link } from "react-router-dom";
import { useStore } from "../store.jsx";
import { countdown, greeting } from "../lib/dates.js";
import { useNow } from "../lib/hooks.js";
import { groupByFilm, tasteMatch } from "../lib/taste.js";
import { filmKey } from "../lib/tmdb.js";
import Loaded from "../components/Loaded.jsx";
import { Empty, Marquee, Says } from "../components/Layout.jsx";
import NightCard from "../components/NightCard.jsx";
import Ticket from "../components/Ticket.jsx";
import Programme from "../components/Programme.jsx";
import JazzCard from "../components/JazzCard.jsx";
import Pierre from "../components/Pierre.jsx";

function HomeBody({ data }) {
  const { me, openModal } = useStore();
  const now = useNow();
  const profiles = data.profiles;

  const upcoming = data.nights
    .filter((n) => n.status !== "done" && countdown(n.when, now).state !== "past")
    .sort((a, b) => a.when.localeCompare(b.when));
  const next = upcoming[0];
  const groups = groupByFilm(data.diary).slice(0, 5);
  const jazz = profiles
    .flatMap((p) => (data.jazz[p] || []).map((entry) => ({ entry, who: p })))
    .sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt))
    .slice(0, 3);
  const other = profiles.find((p) => p !== me);
  const taste = other ? tasteMatch(data.diary[me], data.diary[other]) : null;
  const seenBy = (item) => profiles.filter((p) => (data.diary[p] || []).some((e) => filmKey(e) === filmKey(item)));
  const nightFor = (item) => upcoming.find((n) => filmKey(n) === filmKey(item)) || null;
  const queue = data.watchlist.slice().reverse().slice(0, 6);

  return (
    <div className="page">
      <p className="greet">
        {greeting()} <strong>{me}</strong>.
      </p>

      <Marquee>
        {next ? (
          <NightCard night={next} profiles={profiles} now={now} />
        ) : (
          <div className="night night-empty">
            <Pierre anim="popcorn" scale={8} />
            <div className="night-info">
              <span className="eyebrow gold">NOTHING ON THE SCREEN</span>
              <h3 className="night-title">No movie night planned</h3>
              <p className="muted">Pick something from the queue and put a date on it.</p>
              <div className="row wrap">
                <button type="button" className="btn" onClick={() => openModal("night")}>
                  Plan a night
                </button>
                <button type="button" className="btn ghost" onClick={() => openModal("log")}>
                  Log something
                </button>
              </div>
            </div>
          </div>
        )}
      </Marquee>

      <section className="section">
        <div className="section-head">
          <h2>Tickets in the queue</h2>
          <Link to="/watchlist">See all {data.watchlist.length}</Link>
        </div>
        {queue.length === 0 ? (
          <Empty
            action={
              <button type="button" className="btn" onClick={() => openModal("queue")}>
                Add to the queue
              </button>
            }
          >
            The queue is empty. Add something you two should watch together.
          </Empty>
        ) : (
          <div className="ticket-grid">
            {queue.map((item) => (
              <Ticket key={item.id} item={item} seenBy={seenBy(item)} night={nightFor(item)} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>The programme</h2>
          <Link to="/diary">Open the diary</Link>
        </div>
        {groups.length === 0 ? (
          <Empty
            anim="sleep"
            action={
              <button type="button" className="btn" onClick={() => openModal("log")}>
                Log your first title
              </button>
            }
          >
            Nothing logged yet. Pierre is asleep on the empty diary.
          </Empty>
        ) : (
          <Programme groups={groups} profiles={profiles} />
        )}
      </section>

      <div className="two-col">
        <section className="section">
          <div className="section-head">
            <h2>Intermission: the Jazz shelf</h2>
            <Link to="/jazz">Open the shelf</Link>
          </div>
          {jazz.length === 0 ? (
            <Empty anim="think" action={<button type="button" className="btn ghost" onClick={() => openModal("jazz")}>Add the first thing</button>}>
              Albums, games, books, anything that isn't a film, series or anime. Nothing on the shelf yet.
            </Empty>
          ) : (
            <div className="jazz-row">
              {jazz.map(({ entry, who }) => (
                <JazzCard key={entry.id} entry={entry} who={who} compact />
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Taste match</h2>
            <Link to="/us">More</Link>
          </div>
          {taste && taste.total > 0 ? (
            <div className="panel taste-mini">
              <Pierre anim={taste.percent >= 60 ? "happy" : "shrug"} scale={3} />
              <div className="grow">
                <div className="taste-pct">{taste.percent}%</div>
                <div className="meter" aria-hidden="true">
                  <div style={{ width: `${taste.percent}%` }} />
                </div>
                <p className="muted small-text">
                  {me} and {other} agree on {taste.agreeCount} of {taste.total} shared films.
                  {taste.fight ? ` Biggest fight: ${taste.fight.title}.` : ""}
                </p>
              </div>
            </div>
          ) : (
            <Says anim="think" scale={3}>
              Rate the same film as {other || "your friend"} and I'll tell you how alike you are.
            </Says>
          )}
        </section>
      </div>
    </div>
  );
}

export default function Home() {
  return <Loaded>{(data) => <HomeBody data={data} />}</Loaded>;
}
