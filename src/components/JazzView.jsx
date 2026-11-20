import { fileUrl } from "../api.js";
import { coverOf, labelOf } from "../lib/files.js";
import { useStore } from "../store.jsx";
import Attachments from "./Attachments.jsx";
import LinkEmbed from "./LinkEmbed.jsx";
import { Stars } from "./Stars.jsx";

// One shelf entry, opened up: the photo big, the whole review, everything attached.
export default function JazzView({ entry, who }) {
  const { me, openModal } = useStore();
  const cover = coverOf(entry);
  const label = labelOf(entry);

  return (
    <div className="jazz-view">
      {cover && (
        <a href={fileUrl(cover.key)} target="_blank" rel="noopener noreferrer" className="jazz-view-photo">
          <img src={fileUrl(cover.key)} alt={cover.name || entry.title} loading="lazy" />
        </a>
      )}
      <div className="grow">
        <span className="tag">{entry.category}</span>
        <h3 className="film-title">{entry.title}</h3>
        {entry.by && <p className="muted italic">{entry.by}</p>}
        <p>
          <strong className="gold">{who}</strong> <Stars value={entry.rating} />
        </p>
        {entry.review && <p className="review">{entry.review}</p>}
        {entry.files?.length > 0 && <Attachments files={entry.files} title={entry.title} skipKeys={[cover?.key, label?.key].filter(Boolean)} />}
        {entry.link && <LinkEmbed link={entry.link} title={entry.title} />}
      </div>

      {who === me && (
        <div className="form-actions">
          <span className="grow" />
          <button type="button" className="btn" onClick={() => openModal("jazz", { entry })}>
            Edit this entry
          </button>
        </div>
      )}
    </div>
  );
}
