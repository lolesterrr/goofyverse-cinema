// Pure helpers: taste match between two people and "year in review" stats.

import { filmKey, kindOf } from "./tmdb.js";

const stamp = (e) => `${e.watchedOn}|${e.createdAt || ""}`;

// The latest rated log for each film (a rewatch replaces the older rating).
export function ratedLatest(entries = []) {
  const best = new Map();
  for (const e of entries) {
    if (e.rating == null) continue;
    const key = filmKey(e);
    const cur = best.get(key);
    if (!cur || stamp(e) >= stamp(cur)) best.set(key, e);
  }
  return best;
}

export function tasteMatch(a = [], b = []) {
  const A = ratedLatest(a);
  const B = ratedLatest(b);
  const shared = [];
  for (const [key, ea] of A) {
    const eb = B.get(key);
    if (!eb) continue;
    shared.push({
      key,
      tmdbId: ea.tmdbId,
      media: ea.media || "movie",
      kind: kindOf(ea),
      title: ea.title,
      year: ea.year,
      poster: ea.poster || eb.poster || null,
      a: ea.rating,
      b: eb.rating,
      diff: Math.abs(ea.rating - eb.rating),
    });
  }
  shared.sort((x, y) => y.diff - x.diff || x.title.localeCompare(y.title));
  if (!shared.length) return { shared, total: 0, percent: null, agreeCount: 0, fight: null };
  // 0.5 to 5 stars means the biggest possible gap is 4.5
  const mean = shared.reduce((sum, f) => sum + (1 - f.diff / 4.5), 0) / shared.length;
  return {
    shared,
    total: shared.length,
    percent: Math.round(mean * 100),
    agreeCount: shared.filter((f) => f.diff <= 0.5).length,
    fight: shared[0].diff >= 1.5 ? shared[0] : null,
  };
}

export function yearsIn(lists, fallback = new Date().getFullYear()) {
  const years = new Set([fallback]);
  for (const list of lists) for (const e of list || []) years.add(Number(e.watchedOn.slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

function countKinds(entries) {
  const seen = { movie: new Set(), series: new Set(), anime: new Set() };
  for (const e of entries) seen[kindOf(e)].add(filmKey(e));
  return { movie: seen.movie.size, series: seen.series.size, anime: seen.anime.size };
}

export function profileStats(entries = [], year) {
  const inYear = entries.filter((e) => e.watchedOn.startsWith(String(year)));
  const rated = inYear.filter((e) => e.rating != null);
  const genres = new Map();
  for (const e of inYear) for (const g of e.genres || []) genres.set(g, (genres.get(g) || 0) + 1);
  const histogram = Array.from({ length: 10 }, (_, i) => ({ stars: (i + 1) / 2, count: 0 }));
  for (const e of rated) histogram[e.rating * 2 - 1].count += 1;
  return {
    year,
    logs: inYear.length,
    films: new Set(inYear.map(filmKey)).size,
    byKind: countKinds(inYear),
    avg: rated.length ? Math.round((rated.reduce((s, e) => s + e.rating, 0) / rated.length) * 100) / 100 : null,
    hours: Math.round(inYear.reduce((s, e) => s + (e.runtime || 0), 0) / 60),
    together: inYear.filter((e) => e.together).length,
    topGenres: [...genres]
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, 3)
      .map(([name, count]) => ({ name, count })),
    histogram,
    top: [...rated].sort((x, y) => y.rating - x.rating || y.watchedOn.localeCompare(x.watchedOn)).slice(0, 3),
  };
}

// Group everybody's logs by film, newest film first, for the shared "programme".
export function groupByFilm(diary = {}) {
  const groups = new Map();
  for (const [profile, entries] of Object.entries(diary)) {
    for (const e of entries) {
      const key = filmKey(e);
      let g = groups.get(key);
      if (!g) {
        g = { key, tmdbId: e.tmdbId, media: e.media || "movie", kind: kindOf(e), title: e.title, year: e.year, poster: e.poster, newest: stamp(e), byProfile: {} };
        groups.set(key, g);
      }
      if (stamp(e) > g.newest) g.newest = stamp(e);
      const cur = g.byProfile[profile];
      if (!cur || stamp(e) >= stamp(cur)) g.byProfile[profile] = e;
    }
  }
  return [...groups.values()].sort((x, y) => (x.newest < y.newest ? 1 : -1));
}
