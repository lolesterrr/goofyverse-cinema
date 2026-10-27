import { kindLabel, kindOf } from "../lib/tmdb.js";

// Only series and anime get a badge. A plain film is the default, so it stays quiet.
export default function KindBadge({ film }) {
  const kind = kindOf(film);
  if (kind === "movie") return null;
  return <span className={`badge kind-${kind}`}>{kindLabel(film)}</span>;
}

// "Season 2" for a log of a show, nothing for a film or a whole-show log.
export const seasonLabel = (entry) => (entry && entry.season ? `Season ${entry.season}` : "");
