import { describe, it, expect } from "vitest";
import { tasteMatch, profileStats, groupByFilm, ratedLatest, yearsIn } from "../src/lib/taste.js";
import { countdown, defaultNightInput, toLocalInput, fromLocalInput, fmtDay, todayStr } from "../src/lib/dates.js";
import { fallbackGradient, filmKey, kindOf, posterUrl, toFilm } from "../src/lib/tmdb.js";

const log = (tmdbId, title, rating, watchedOn, extra = {}) => ({
  id: `${tmdbId}-${watchedOn}`, tmdbId, title, year: 2000, poster: null, genres: [], runtime: 100, rating, watchedOn, createdAt: `${watchedOn}T10:00:00Z`, ...extra,
});

describe("taste match", () => {
  it("is null with no shared films", () => {
    const r = tasteMatch([log(1, "A", 4, "2026-01-01")], [log(2, "B", 4, "2026-01-02")]);
    expect(r.percent).toBeNull();
    expect(r.total).toBe(0);
  });

  it("scores identical taste at 100 and finds the biggest fight", () => {
    const same = tasteMatch([log(1, "A", 4, "2026-01-01")], [log(1, "A", 4, "2026-01-03")]);
    expect(same.percent).toBe(100);
    expect(same.fight).toBeNull();

    const r = tasteMatch(
      [log(1, "A", 5, "2026-01-01"), log(2, "B", 3, "2026-01-02"), log(3, "C", 4, "2026-01-02")],
      [log(1, "A", 2, "2026-01-01"), log(2, "B", 3.5, "2026-01-02"), log(4, "D", 1, "2026-01-02")],
    );
    expect(r.total).toBe(2);
    expect(r.fight.title).toBe("A");
    expect(r.fight.diff).toBe(3);
    expect(r.agreeCount).toBe(1);
    // A: 1 - 3/4.5, B: 1 - 0.5/4.5, mean of the two
    expect(r.percent).toBe(Math.round(((1 - 3 / 4.5 + (1 - 0.5 / 4.5)) / 2) * 100));
  });

  it("ignores unrated logs and uses the latest rating on a rewatch", () => {
    const latest = ratedLatest([log(1, "A", 2, "2026-01-01"), log(1, "A", 4.5, "2026-06-01"), log(1, "A", null, "2026-09-01")]);
    expect(latest.get("movie:1").rating).toBe(4.5);
  });
});

describe("year in review", () => {
  const entries = [
    log(1, "A", 5, "2026-02-01", { genres: ["Drama", "Music"], runtime: 106, together: true }),
    log(2, "B", 3, "2026-03-01", { genres: ["Drama"], runtime: 120 }),
    log(2, "B", 4, "2026-04-01", { genres: ["Drama"], runtime: 120 }),
    log(3, "C", null, "2026-05-01", { genres: ["Comedy"], runtime: 90 }),
    log(4, "D", 4, "2025-12-31", { genres: ["Horror"], runtime: 100 }),
  ];

  it("counts a year's logs, films, average, hours and genres", () => {
    const s = profileStats(entries, 2026);
    expect(s.logs).toBe(4);
    expect(s.films).toBe(3);
    expect(s.avg).toBe(4);
    expect(s.hours).toBe(Math.round(436 / 60));
    expect(s.together).toBe(1);
    expect(s.topGenres[0]).toEqual({ name: "Drama", count: 3 });
    expect(s.histogram[9].count).toBe(1);
    expect(s.top[0].title).toBe("A");
  });

  it("handles an empty year", () => {
    const s = profileStats([], 2026);
    expect(s.avg).toBeNull();
    expect(s.films).toBe(0);
  });

  it("lists years with the current one first", () => {
    expect(yearsIn([entries], 2026)).toEqual([2026, 2025]);
  });
});

describe("programme grouping", () => {
  it("puts both people's takes on one film, newest film first", () => {
    const groups = groupByFilm({
      Kensss: [log(1, "A", 4, "2026-01-01"), log(2, "B", 3, "2026-03-01")],
      Goof: [log(1, "A", 5, "2026-04-01")],
    });
    expect(groups.map((g) => g.title)).toEqual(["A", "B"]);
    expect(groups[0].byProfile.Kensss.rating).toBe(4);
    expect(groups[0].byProfile.Goof.rating).toBe(5);
  });
});

describe("dates", () => {
  const now = new Date("2026-10-27T12:00:00Z").getTime();
  it("counts down in days, hours or minutes", () => {
    expect(countdown("2026-10-30T12:00:00Z", now)).toEqual({ state: "future", big: "3", unit: "days" });
    expect(countdown("2026-10-28T20:00:00Z", now)).toEqual({ state: "future", big: "32", unit: "hours" });
    // under two hours switches to minutes
    expect(countdown("2026-10-27T13:30:00Z", now)).toEqual({ state: "future", big: "90", unit: "minutes" });
    expect(countdown("2026-10-27T12:20:00Z", now)).toEqual({ state: "future", big: "20", unit: "minutes" });
  });
  it("says now for three hours after the start, then counts days ago", () => {
    expect(countdown("2026-10-27T10:00:00Z", now).state).toBe("now");
    expect(countdown("2026-10-24T12:00:00Z", now)).toEqual({ state: "past", big: "3", unit: "days ago" });
    expect(countdown("2026-10-27T05:00:00Z", now)).toEqual({ state: "past", big: "Today", unit: "earlier" });
  });
  it("round-trips a local datetime input", () => {
    const iso = "2026-10-30T17:30:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(defaultNightInput(new Date(2026, 9, 27, 9, 0))).toBe("2026-10-28T20:00");
  });
  it("formats calendar days without a timezone shift", () => {
    expect(fmtDay("2026-10-20")).toMatch(/20/);
    expect(todayStr(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("tmdb helpers", () => {
  it("builds poster urls and stable fallbacks", () => {
    expect(posterUrl("/a.jpg")).toBe("https://image.tmdb.org/t/p/w342/a.jpg");
    expect(posterUrl(null)).toBeNull();
    expect(fallbackGradient("Paprika")).toBe(fallbackGradient("Paprika"));
    expect(fallbackGradient("Paprika")).not.toBe(fallbackGradient("Heat"));
  });
  it("keeps only the stored film fields", () => {
    expect(toFilm({ tmdbId: 1, title: "X", overview: "long", score: 7 })).toEqual({ tmdbId: 1, media: "movie", kind: "movie", title: "X", year: null, poster: null, genres: [], runtime: null });
  });
  it("tells films, series and anime apart, and never mixes a film with a show of the same number", () => {
    expect(filmKey({ tmdbId: 5 })).toBe("movie:5");
    expect(filmKey({ tmdbId: 5, media: "tv" })).toBe("tv:5");
    expect(kindOf({ tmdbId: 5, media: "tv" })).toBe("series");
    expect(kindOf({ tmdbId: 5, media: "tv", kind: "anime" })).toBe("anime");
    expect(kindOf({ tmdbId: 5, media: "movie", kind: "anime" })).toBe("anime");
  });
});

describe("series and anime", () => {
  const show = (tmdbId, title, rating, watchedOn, extra = {}) => ({ ...log(tmdbId, title, rating, watchedOn), media: "tv", kind: "series", runtime: null, ...extra });

  it("keeps a film and a show with the same TMDB number apart", () => {
    const t = tasteMatch([log(7, "Film", 4, "2026-01-01")], [show(7, "Show", 2, "2026-01-02")]);
    expect(t.total).toBe(0);
    const groups = groupByFilm({ Kensss: [log(7, "Film", 4, "2026-01-01"), show(7, "Show", 2, "2026-01-02")], Goof: [] });
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.key)).size).toBe(2);
  });

  it("matches a show across two people and carries its kind", () => {
    const t = tasteMatch([show(9, "Bebop", 5, "2026-01-01", { kind: "anime" })], [show(9, "Bebop", 4.5, "2026-02-01", { kind: "anime" })]);
    expect(t.total).toBe(1);
    expect(t.shared[0]).toMatchObject({ key: "tv:9", media: "tv", kind: "anime" });
  });

  it("counts each kind once per title in the year in review, and adds no runtime for shows", () => {
    const s = profileStats(
      [log(1, "Film", 4, "2026-01-01"), show(2, "Show", 5, "2026-02-01", { season: 1 }), show(2, "Show", 5, "2026-03-01", { season: 2 }), show(3, "Bebop", 4, "2026-04-01", { kind: "anime" })],
      2026,
    );
    expect(s.films).toBe(3);
    expect(s.byKind).toEqual({ movie: 1, series: 1, anime: 1 });
    expect(s.hours).toBe(Math.round(100 / 60));
  });
});
