import { useStore } from "../store.jsx";
import { Stars } from "./Stars.jsx";

const HUES = { album: 350, track: 38, anime: 210, game: 140, show: 280, book: 20, food: 60, other: 190 };

function hueFor(category) {
  if (HUES[category] !== undefined) return HUES[category];
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return h % 360;
}

// One thing on the Jazz shelf, drawn as a record.
export default function JazzCard({ entry, who, compact = false }) {
  const { me, openModal } = useStore();
  const hue = hueFor(entry.category);
  return (
    <article className={`jazz-card${compact ? " compact" : ""}`}>
      <div
        className="vinyl"
        style={{ background: `radial-gradient(circle, hsl(${hue} 75% 55%) 0 15%, #0b0a0c 16% 18%, #1c1419 19% 100%)` }}
        aria-hidden="true"
      />
      <div className="jazz-text">
        <span className="tag">{entry.category}</span>
        <strong className="display">{entry.title}</strong>
        {entry.by && <span className="muted">{entry.by}</span>}
        <div>
          <strong className="gold">{who}</strong> <Stars value={entry.rating} />
        </div>
        {entry.review && !compact && <p className="review clamp">{entry.review}</p>}
        {who === me && !compact && (
          <button type="button" className="link-btn" onClick={() => openModal("jazz", { entry })}>
            Edit
          </button>
        )}
      </div>
    </article>
  );
}
