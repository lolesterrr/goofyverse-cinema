// TMDB serves posters from its own image host and needs no key for that.
const IMG = "https://image.tmdb.org/t/p";

export const posterUrl = (path, size = "w342") => (path ? `${IMG}/${size}${path}` : null);
export const backdropUrl = (path, size = "w780") => (path ? `${IMG}/${size}${path}` : null);

// A stable colour pair per title, for the poster that has no picture.
export function fallbackGradient(title = "") {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 40) % 360;
  return `linear-gradient(160deg, hsl(${a} 45% 38%), hsl(${b} 50% 16%))`;
}

// The shape we store for a film, from either a search hit or full details.
export function toFilm(src) {
  return {
    tmdbId: src.tmdbId,
    title: src.title,
    year: src.year ?? null,
    poster: src.poster ?? null,
    genres: src.genres || [],
    runtime: src.runtime ?? null,
  };
}
