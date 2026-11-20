import { fileUrl } from "../api.js";
import { kindOfType } from "../lib/files.js";

// Photos, songs and videos attached to a Jazz entry. Audio and video load only when played.
export default function Attachments({ files = [], title, skipKeys = [] }) {
  const shown = files.filter((f) => !skipKeys.includes(f.key)); // whatever is already on the card
  if (!shown.length) return null;
  return (
    <div className="attachments">
      {shown.map((f) => {
        const url = fileUrl(f.key);
        const kind = kindOfType(f.type);
        const label = f.name || title;
        if (kind === "image") {
          return (
            <a key={f.key} href={url} target="_blank" rel="noopener noreferrer" className="attach-photo">
              <img src={url} alt={label} loading="lazy" />
            </a>
          );
        }
        if (kind === "video") {
          return (
            <figure key={f.key} className="attach-media">
              <video controls preload="metadata" playsInline src={url} aria-label={label} />
              {f.name && <figcaption className="muted small-text">{f.name}</figcaption>}
            </figure>
          );
        }
        return (
          <figure key={f.key} className="attach-media">
            <audio controls preload="none" src={url} aria-label={label} />
            {f.name && <figcaption className="muted small-text">{f.name}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}
