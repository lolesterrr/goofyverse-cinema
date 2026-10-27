import { useState } from "react";
import { fallbackGradient, posterUrl } from "../lib/tmdb.js";

export default function Poster({ path, title, size = "w342", className = "" }) {
  const [broken, setBroken] = useState(false);
  const url = posterUrl(path, size);
  if (!url || broken) {
    return (
      <div className={`poster poster-fallback ${className}`} style={{ background: fallbackGradient(title) }} role="img" aria-label={`${title}, no poster`}>
        <span>{title}</span>
      </div>
    );
  }
  return <img className={`poster ${className}`} src={url} alt={`${title} poster`} loading="lazy" onError={() => setBroken(true)} />;
}
