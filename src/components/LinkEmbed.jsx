import { useState } from "react";
import { parseLink } from "../lib/embed.js";

const IFRAME_TYPES = new Set(["youtube", "spotify", "soundcloud"]);

// A link on a Jazz card. Third party players only load after you press play.
export default function LinkEmbed({ link, title }) {
  const [open, setOpen] = useState(false);
  const info = parseLink(link);
  if (!info) return null;

  const openLink = (
    <a className="link-btn" href={info.href} target="_blank" rel="noopener noreferrer">
      Open on {info.host}
    </a>
  );

  if (info.type === "link") return <div className="embed">{openLink}</div>;

  if (info.type === "image") {
    return (
      <div className="embed">
        <a href={info.href} target="_blank" rel="noopener noreferrer">
          <img className="embed-img" src={info.src} alt={title} loading="lazy" referrerPolicy="no-referrer" />
        </a>
      </div>
    );
  }
  if (info.type === "audio") {
    return (
      <div className="embed">
        <audio controls preload="none" src={info.src} aria-label={title} />
        {openLink}
      </div>
    );
  }
  if (info.type === "video") {
    return (
      <div className="embed">
        <video className="embed-video" controls preload="none" playsInline src={info.src} aria-label={title} />
        {openLink}
      </div>
    );
  }

  // youtube, spotify, soundcloud
  return (
    <div className="embed">
      {open && IFRAME_TYPES.has(info.type) ? (
        <iframe
          className="embed-frame"
          style={info.ratio ? { aspectRatio: info.ratio } : { height: info.height }}
          src={info.src}
          title={`${title} on ${info.type}`}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
        />
      ) : (
        <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
          ▶ Play here
        </button>
      )}
      {openLink}
    </div>
  );
}
