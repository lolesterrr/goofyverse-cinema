import { useState } from "react";
import { useStore } from "../store.jsx";
import { countdown } from "../lib/dates.js";
import { explain } from "../lib/errors.js";
import { useNow } from "../lib/hooks.js";
import { KINDS, filmKey, kindOf, toFilm } from "../lib/tmdb.js";
import Loaded from "../components/Loaded.jsx";
import { Empty } from "../components/Layout.jsx";
import Ticket from "../components/Ticket.jsx";

function WatchlistBody({ data }) {
  const { me, openModal, removeFromWatchlist, say } = useStore();
  const now = useNow();
  const [onlyUnseen, setOnlyUnseen] = useState(false);
  const [kind, setKind] = useState("all");
  const profiles = data.profiles;

  const seen = (p, item) => (data.diary[p] || []).some((e) => filmKey(e) === filmKey(item));
  const upcoming = data.nights.filter((n) => n.status !== "done" && countdown(n.when, now).state !== "past");
  const items = data.watchlist.slice().reverse().filter((i) => (!onlyUnseen || !seen(me, i)) && (kind === "all" || kindOf(i) === kind));

  async function remove(item) {
    if (!window.confirm(`Take ${item.title} off the queue?`)) return;
    try {
      await removeFromWatchlist(item.id);
    } catch (e) {
      say(explain(e), "shrug");
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Watchlist</h1>
        <button type="button" className="btn" onClick={() => openModal("queue")}>
          Add to the queue
        </button>
      </div>
      <p className="muted">One queue for all of you. Anyone can add, plan a night or take something off.</p>

      <div className="filters">
        <div className="chips" role="group" aria-label="Filter the queue">
          <button type="button" className="chip" aria-pressed={!onlyUnseen} onClick={() => setOnlyUnseen(false)}>
            Everything ({data.watchlist.length})
          </button>
          <button type="button" className="chip" aria-pressed={onlyUnseen} onClick={() => setOnlyUnseen(true)}>
            Not seen by me
          </button>
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
      </div>

      {data.watchlist.length === 0 ? (
        <Empty
          action={
            <button type="button" className="btn" onClick={() => openModal("queue")}>
              Add the first title
            </button>
          }
        >
          Nothing queued. What should you two watch next?
        </Empty>
      ) : items.length === 0 ? (
        <Empty anim="happy">Nothing in the queue matches. Or you've seen it all. Impressive.</Empty>
      ) : (
        <div className="ticket-grid">
          {items.map((item) => (
            <Ticket
              key={item.id}
              item={item}
              seenBy={profiles.filter((p) => seen(p, item))}
              night={upcoming.find((n) => filmKey(n) === filmKey(item)) || null}
              actions={
                <div className="row wrap">
                  <button type="button" className="btn ghost small" onClick={() => openModal("night", { film: toFilm(item) })}>
                    Plan a night
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => openModal("log", { film: toFilm(item) })}>
                    Log it
                  </button>
                  <button type="button" className="link-btn" onClick={() => remove(item)}>
                    Remove
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Watchlist() {
  return <Loaded>{(data) => <WatchlistBody data={data} />}</Loaded>;
}
