import { fileUrl } from "../api.js";
import { coverOf } from "../lib/files.js";
import { useStore } from "../store.jsx";
import Attachments from "./Attachments.jsx";
import LinkEmbed from "./LinkEmbed.jsx";
import { Stars } from "./Stars.jsx";

const HUES = { album: 350, track: 38, game: 140, podcast: 210, book: 20, food: 60, other: 190 };

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
  const cover = coverOf(entry);
  const coverSrc = cover ? fileUrl(cover.key) : null;
  // No photo: the old coloured record. A photo: it becomes the label, and a blurred
  // copy sits behind the whole card.
  const plain = { background: `radial-gradient(circle, hsl(${hue} 75% 55%) 0 15%, #0b0a0c 16% 18%, #1c1419 19% 100%)` };
  const disc = coverSrc ? (
    <a className="vinyl has-label" href={coverSrc} target="_blank" rel="noopener noreferrer" aria-label={`Open ${cover.name || "the photo"}`}>
      <img src={coverSrc} alt="" loading="lazy" />
    </a>
  ) : (
    <div className="vinyl" style={plain} aria-hidden="true" />
  );

  return (
    <article
      className={`jazz-card${compact ? " compact" : ""}${coverSrc && !compact ? " has-wall" : ""}`}
      style={coverSrc && !compact ? { "--wall": `url("${coverSrc}")` } : undefined}
    >
      {disc}
      <div className="jazz-text">
        <span className="tag">{entry.category}</span>
        <strong className="display">{entry.title}</strong>
        {entry.by && <span className="muted">{entry.by}</span>}
        <div>
          <strong className="gold">{who}</strong> <Stars value={entry.rating} />
        </div>
        {entry.review && !compact && <p className="review clamp">{entry.review}</p>}
        {entry.files?.length > 0 && !compact && <Attachments files={entry.files} title={entry.title} skipKey={cover?.key} />}
        {entry.link && !compact && <LinkEmbed link={entry.link} title={entry.title} />}
        {entry.files?.length > 0 && compact && <span className="muted small-text">{entry.files.length} attached</span>}
        {who === me && !compact && (
          <button type="button" className="link-btn" onClick={() => openModal("jazz", { entry })}>
            Edit
          </button>
        )}
      </div>
    </article>
  );
}
