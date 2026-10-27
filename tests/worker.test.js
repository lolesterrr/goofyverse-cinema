import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handle } from "../worker/index.js";

class FakeKV {
  constructor() {
    this.map = new Map();
  }
  async get(key, type) {
    const v = this.map.get(key);
    if (v === undefined) return null;
    return type === "json" ? JSON.parse(v) : v;
  }
  async put(key, value) {
    this.map.set(key, String(value));
  }
  async delete(key) {
    this.map.delete(key);
  }
}

const ORIGIN = "https://lolesterrr.github.io";

function makeEnv(extra = {}) {
  return {
    GOOFY_KV: new FakeKV(),
    PASSPHRASE: "correct horse battery",
    SIGNING_KEY: "test-signing-key-test-signing-key",
    PROFILES: "Kensss,Goof",
    ALLOWED_ORIGINS: ORIGIN,
    ...extra,
  };
}

async function call(env, method, path, body, token, headers = {}) {
  const init = { method, headers: { origin: ORIGIN, "content-type": "application/json", ...headers } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await handle(new Request(`https://worker.test${path}`, init), env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

async function signIn(env, profile = "Kensss") {
  const r = await call(env, "POST", "/api/login", { passphrase: env.PASSPHRASE, profile });
  expect(r.status).toBe(200);
  return r.body.token;
}

const sampleFilm = { tmdbId: 129, title: "Spirited Away", year: 2001, poster: "/abc.jpg", genres: ["Animation"], runtime: 125 };

describe("sign in", () => {
  it("reports what is configured on /api/health without a token", async () => {
    const r = await call(makeEnv(), "GET", "/api/health");
    expect(r.body).toEqual({ ok: true, kv: true, auth: true, tmdb: false });
  });

  it("rejects a wrong passphrase and accepts the right one", async () => {
    const env = makeEnv();
    const bad = await call(env, "POST", "/api/login", { passphrase: "nope", profile: "Kensss" });
    expect(bad.status).toBe(401);
    const good = await call(env, "POST", "/api/login", { passphrase: env.PASSPHRASE, profile: "goof" });
    expect(good.status).toBe(200);
    expect(good.body.profile).toBe("Goof");
    expect(good.body.token).toBeTruthy();
  });

  it("only lists profiles after the passphrase is right", async () => {
    const env = makeEnv();
    expect((await call(env, "POST", "/api/profiles", { passphrase: "nope" })).status).toBe(401);
    const ok = await call(env, "POST", "/api/profiles", { passphrase: env.PASSPHRASE });
    expect(ok.body.profiles).toEqual(["Kensss", "Goof"]);
  });

  it("refuses unknown profiles", async () => {
    const env = makeEnv();
    const r = await call(env, "POST", "/api/login", { passphrase: env.PASSPHRASE, profile: "Stranger" });
    expect(r.status).toBe(400);
  });

  it("locks out after 8 wrong guesses from one address", async () => {
    const env = makeEnv();
    for (let i = 0; i < 8; i++) {
      const r = await call(env, "POST", "/api/login", { passphrase: "x", profile: "Goof" }, null, { "cf-connecting-ip": "1.2.3.4" });
      expect(r.status).toBe(401);
    }
    const locked = await call(env, "POST", "/api/login", { passphrase: env.PASSPHRASE, profile: "Goof" }, null, { "cf-connecting-ip": "1.2.3.4" });
    expect(locked.status).toBe(429);
    const other = await call(env, "POST", "/api/login", { passphrase: env.PASSPHRASE, profile: "Goof" }, null, { "cf-connecting-ip": "5.6.7.8" });
    expect(other.status).toBe(200);
  });

  it("needs a valid token for data, and a removed profile loses access", async () => {
    const env = makeEnv();
    expect((await call(env, "GET", "/api/state")).status).toBe(401);
    expect((await call(env, "GET", "/api/state", undefined, "garbage.token")).status).toBe(401);
    const token = await signIn(env, "Goof");
    expect((await call(env, "GET", "/api/state", undefined, token)).status).toBe(200);
    env.PROFILES = "Kensss";
    expect((await call(env, "GET", "/api/state", undefined, token)).status).toBe(401);
  });
});

describe("cors", () => {
  it("blocks other origins and answers preflight for ours", async () => {
    const env = makeEnv();
    const evil = await handle(new Request("https://worker.test/api/health", { headers: { origin: "https://evil.example" } }), env);
    expect(evil.status).toBe(403);
    const pre = await handle(new Request("https://worker.test/api/state", { method: "OPTIONS", headers: { origin: ORIGIN } }), env);
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const ok = await call(env, "GET", "/api/health");
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });
});

describe("diary", () => {
  let env, kens, goof;
  beforeEach(async () => {
    env = makeEnv();
    kens = await signIn(env, "Kensss");
    goof = await signIn(env, "Goof");
  });

  const entry = (extra = {}) => ({ ...sampleFilm, rating: 4.5, review: "Wonderful.", watchedOn: "2026-10-20", together: true, ...extra });

  it("saves, updates and shows each person's own entries", async () => {
    const put = await call(env, "PUT", "/api/diary/entry-one", entry(), kens);
    expect(put.status).toBe(200);
    await call(env, "PUT", "/api/diary/entry-one", entry({ rating: 3 }), kens);
    await call(env, "PUT", "/api/diary/entry-two", entry({ rating: 2 }), goof);
    const state = (await call(env, "GET", "/api/state", undefined, kens)).body;
    expect(state.diary.Kensss).toHaveLength(1);
    expect(state.diary.Kensss[0].rating).toBe(3);
    expect(state.diary.Goof[0].rating).toBe(2);
  });

  it("cannot delete somebody else's entry", async () => {
    await call(env, "PUT", "/api/diary/entry-two", entry(), goof);
    await call(env, "DELETE", "/api/diary/entry-two", undefined, kens);
    const state = (await call(env, "GET", "/api/state", undefined, goof)).body;
    expect(state.diary.Goof).toHaveLength(1);
    await call(env, "DELETE", "/api/diary/entry-two", undefined, goof);
    expect((await call(env, "GET", "/api/state", undefined, goof)).body.diary.Goof).toHaveLength(0);
  });

  it("validates ratings, dates and posters", async () => {
    expect((await call(env, "PUT", "/api/diary/entry-x1", entry({ rating: 4.7 }), kens)).body.error).toBe("rating-invalid");
    expect((await call(env, "PUT", "/api/diary/entry-x1", entry({ rating: 6 }), kens)).status).toBe(400);
    expect((await call(env, "PUT", "/api/diary/entry-x1", entry({ watchedOn: "yesterday" }), kens)).body.error).toBe("date-invalid");
    expect((await call(env, "PUT", "/api/diary/entry-x1", entry({ poster: "https://evil.example/x.jpg" }), kens)).body.error).toBe("poster-invalid");
    expect((await call(env, "PUT", "/api/diary/x", entry(), kens)).body.error).toBe("id-invalid");
    expect((await call(env, "PUT", "/api/diary/entry-x1", entry({ tmdbId: undefined }), kens)).body.error).toBe("tmdbId-required");
  });

  it("keeps a season on a show and drops it from a film", async () => {
    const show = { tmdbId: 30991, media: "tv", kind: "anime", title: "Cowboy Bebop", year: 1998, poster: "/b.jpg", genres: ["Animation"], runtime: null };
    const ok = await call(env, "PUT", "/api/diary/show-one", entry({ ...show, season: 1 }), kens);
    expect(ok.body.entry).toMatchObject({ media: "tv", kind: "anime", season: 1 });
    const film = await call(env, "PUT", "/api/diary/film-one", entry({ season: 3 }), kens);
    expect(film.body.entry).toMatchObject({ media: "movie", kind: "movie", season: null });
    const none = await call(env, "PUT", "/api/diary/show-two", entry({ ...show, season: undefined }), kens);
    expect(none.body.entry.season).toBeNull();
  });

  it("rejects bad media, kind and season values", async () => {
    expect((await call(env, "PUT", "/api/diary/entry-x1", entry({ media: "book" }), kens)).body.error).toBe("media-invalid");
    expect((await call(env, "PUT", "/api/diary/entry-x1", entry({ kind: "cartoon" }), kens)).body.error).toBe("kind-invalid");
    expect((await call(env, "PUT", "/api/diary/entry-x1", entry({ media: "tv", season: 0 }), kens)).body.error).toBe("season-invalid");
  });

  it("allows a log without a rating", async () => {
    const r = await call(env, "PUT", "/api/diary/entry-nr", entry({ rating: null }), kens);
    expect(r.status).toBe(200);
    expect(r.body.entry.rating).toBeNull();
  });
});

describe("jazz shelf", () => {
  it("keeps anything-goes entries per person", async () => {
    const env = makeEnv();
    const kens = await signIn(env, "Kensss");
    const put = await call(env, "PUT", "/api/jazz/jazz-one", { title: "Kind of Blue", category: "Album", by: "Miles Davis", rating: 5, review: "Perfect." }, kens);
    expect(put.status).toBe(200);
    expect(put.body.entry.category).toBe("album");
    const state = (await call(env, "GET", "/api/state", undefined, kens)).body;
    expect(state.jazz.Kensss[0].title).toBe("Kind of Blue");
    expect((await call(env, "PUT", "/api/jazz/jazz-two", { title: "", category: "game" }, kens)).status).toBe(400);
  });
});

describe("watchlist and movie nights", () => {
  it("shares one watchlist and refuses duplicates", async () => {
    const env = makeEnv();
    const kens = await signIn(env, "Kensss");
    const goof = await signIn(env, "Goof");
    const first = await call(env, "POST", "/api/watchlist", { ...sampleFilm, note: "for friday" }, kens);
    expect(first.status).toBe(201);
    const again = await call(env, "POST", "/api/watchlist", sampleFilm, goof);
    expect(again.body.already).toBe(true);
    expect((await call(env, "GET", "/api/state", undefined, goof)).body.watchlist).toHaveLength(1);
    await call(env, "DELETE", `/api/watchlist/${first.body.item.id}`, undefined, goof);
    expect((await call(env, "GET", "/api/state", undefined, kens)).body.watchlist).toHaveLength(0);
  });

  it("treats a film and a show with the same TMDB number as different things", async () => {
    const env = makeEnv();
    const kens = await signIn(env, "Kensss");
    const film = await call(env, "POST", "/api/watchlist", { ...sampleFilm, tmdbId: 555 }, kens);
    const show = await call(env, "POST", "/api/watchlist", { ...sampleFilm, tmdbId: 555, media: "tv", kind: "series", title: "Some Show" }, kens);
    expect(film.status).toBe(201);
    expect(show.status).toBe(201);
    const again = await call(env, "POST", "/api/watchlist", { ...sampleFilm, tmdbId: 555, media: "tv", kind: "series", title: "Some Show" }, kens);
    expect(again.body.already).toBe(true);
    expect((await call(env, "GET", "/api/state", undefined, kens)).body.watchlist).toHaveLength(2);
  });

  it("plans a night, tracks RSVPs and deletes it", async () => {
    const env = makeEnv();
    const kens = await signIn(env, "Kensss");
    const goof = await signIn(env, "Goof");
    const when = "2026-10-30T17:00:00.000Z";
    const made = await call(env, "PUT", "/api/nights/night-one", { ...sampleFilm, when, place: "my place" }, kens);
    expect(made.status).toBe(200);
    expect(made.body.night.rsvp).toEqual({ Kensss: "in", Goof: "maybe" });
    const rsvp = await call(env, "PUT", "/api/nights/night-one/rsvp", { status: "in" }, goof);
    expect(rsvp.body.night.rsvp.Goof).toBe("in");
    expect((await call(env, "PUT", "/api/nights/night-one/rsvp", { status: "nope" }, goof)).status).toBe(400);
    expect((await call(env, "PUT", "/api/nights/missing-one/rsvp", { status: "in" }, goof)).status).toBe(404);
    const edit = await call(env, "PUT", "/api/nights/night-one", { ...sampleFilm, when, place: "his place", status: "done" }, goof);
    expect(edit.body.night.rsvp.Goof).toBe("in");
    expect(edit.body.night.createdBy).toBe("Kensss");
    expect(edit.body.night.status).toBe("done");
    expect((await call(env, "PUT", "/api/nights/night-two", { ...sampleFilm, when: "not a date" }, kens)).body.error).toBe("when-invalid");
    await call(env, "DELETE", "/api/nights/night-one", undefined, kens);
    expect((await call(env, "GET", "/api/state", undefined, kens)).body.nights).toHaveLength(0);
  });
});

describe("tmdb proxy", () => {
  let realFetch;
  beforeEach(() => {
    realFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("explains itself when no TMDB key is set", async () => {
    const env = makeEnv();
    const token = await signIn(env);
    const r = await call(env, "GET", "/api/tmdb/search?q=paprika", undefined, token);
    expect(r.status).toBe(503);
    expect(r.body.error).toBe("tmdb-not-configured");
  });

  it("searches with a read-access token and trims the result", async () => {
    const env = makeEnv({ TMDB_TOKEN: "x".repeat(120) });
    const token = await signIn(env);
    let seen;
    globalThis.fetch = vi.fn(async (url, init) => {
      seen = { url: String(url), headers: init.headers };
      return new Response(JSON.stringify({ results: [
        { id: 4977, media_type: "movie", title: "Paprika", release_date: "2006-11-25", poster_path: "/p.jpg", overview: "Dreams.", vote_average: 7.69, genre_ids: [16, 9648], original_language: "ja" },
        { id: 99, media_type: "person", name: "Satoshi Kon" },
        { id: 30991, media_type: "tv", name: "Cowboy Bebop", first_air_date: "1998-10-24", poster_path: "/b.jpg", genre_ids: [16, 10759], original_language: "ja" },
        { id: 2316, media_type: "tv", name: "The Office", first_air_date: "2005-03-24", poster_path: "/o.jpg", genre_ids: [35], original_language: "en" },
        { id: 603, media_type: "movie", title: "Heat", release_date: "1995-12-15", genre_ids: [28], original_language: "en" },
      ] }), { status: 200 });
    });
    const r = await call(env, "GET", "/api/tmdb/search?q=paprika", undefined, token);
    expect(r.status).toBe(200);
    // people are dropped; films, shows and anime are labelled
    expect(r.body.results.map((x) => [x.title, x.media, x.kind])).toEqual([
      ["Paprika", "movie", "anime"],
      ["Cowboy Bebop", "tv", "anime"],
      ["The Office", "tv", "series"],
      ["Heat", "movie", "movie"],
    ]);
    expect(r.body.results[0]).toEqual({ tmdbId: 4977, media: "movie", kind: "anime", title: "Paprika", year: 2006, poster: "/p.jpg", overview: "Dreams.", score: 7.7 });
    expect(r.body.results[1].year).toBe(1998);
    expect(seen.url).toContain("/search/multi");
    expect(seen.url).toContain("query=paprika");
    expect(seen.url).not.toContain("api_key");
    expect(seen.headers.authorization).toBe(`Bearer ${"x".repeat(120)}`);
  });

  it("uses api_key for short v3 keys and needs a sign in", async () => {
    const env = makeEnv({ TMDB_TOKEN: "abc123abc123abc123abc123abc123ab" });
    expect((await call(env, "GET", "/api/tmdb/trending")).status).toBe(401);
    const token = await signIn(env);
    let seenUrl;
    globalThis.fetch = vi.fn(async (url) => {
      seenUrl = String(url);
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    const r = await call(env, "GET", "/api/tmdb/trending", undefined, token);
    expect(r.body.results).toEqual([]);
    expect(seenUrl).toContain("/trending/all/week");
    expect(seenUrl).toContain("api_key=abc123abc123abc123abc123abc123ab");
  });

  it("returns show details with seasons, creators and no per-show runtime", async () => {
    const env = makeEnv({ TMDB_TOKEN: "x".repeat(120) });
    const token = await signIn(env);
    let seenUrl;
    globalThis.fetch = vi.fn(async (url) => {
      seenUrl = String(url);
      return new Response(JSON.stringify({
        id: 30991, name: "Cowboy Bebop", first_air_date: "1998-10-24", poster_path: "/b.jpg", backdrop_path: "/bb.jpg",
        overview: "Bounty hunters.", tagline: "", episode_run_time: [24], vote_average: 8.7, original_language: "ja",
        number_of_seasons: 1, number_of_episodes: 26, genres: [{ name: "Animation" }, { name: "Action & Adventure" }],
        created_by: [{ name: "Hajime Yatate" }],
      }), { status: 200 });
    });
    const r = await call(env, "GET", "/api/tmdb/tv/30991", undefined, token);
    expect(seenUrl).toContain("/3/tv/30991");
    expect(r.body).toMatchObject({ tmdbId: 30991, media: "tv", kind: "anime", title: "Cowboy Bebop", year: 1998, seasons: 1, episodes: 26, runtime: null, creators: ["Hajime Yatate"] });
    expect(r.body.genres).toEqual(["Animation", "Action & Adventure"]);
    expect((await call(env, "GET", "/api/tmdb/tv/abc", undefined, token)).status).toBe(400);
  });

  it("calls a Japanese animated film anime in its details too", async () => {
    const env = makeEnv({ TMDB_TOKEN: "x".repeat(120) });
    const token = await signIn(env);
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: 4977, title: "Paprika", release_date: "2006-11-25", original_language: "ja", genres: [{ name: "Animation" }], credits: { crew: [] } }), { status: 200 }));
    const r = await call(env, "GET", "/api/tmdb/movie/4977", undefined, token);
    expect(r.body).toMatchObject({ media: "movie", kind: "anime" });
  });

  it("returns film details with genres and directors", async () => {
    const env = makeEnv({ TMDB_TOKEN: "x".repeat(120) });
    const token = await signIn(env);
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        id: 4977, title: "Paprika", release_date: "2006-11-25", poster_path: "/p.jpg", backdrop_path: "/b.jpg",
        overview: "Dreams.", tagline: "Enter the dream", runtime: 90, vote_average: 7.69,
        genres: [{ name: "Animation" }, { name: "Mystery" }],
        credits: { crew: [{ job: "Director", name: "Satoshi Kon" }, { job: "Writer", name: "Someone" }] },
      }), { status: 200 }));
    const r = await call(env, "GET", "/api/tmdb/movie/4977", undefined, token);
    expect(r.body.genres).toEqual(["Animation", "Mystery"]);
    expect(r.body.directors).toEqual(["Satoshi Kon"]);
    expect(r.body.runtime).toBe(90);
    expect((await call(env, "GET", "/api/tmdb/movie/abc", undefined, token)).status).toBe(400);
  });

  it("turns TMDB failures into clean errors", async () => {
    const env = makeEnv({ TMDB_TOKEN: "x".repeat(120) });
    const token = await signIn(env);
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 500 }));
    expect((await call(env, "GET", "/api/tmdb/search?q=a", undefined, token)).status).toBe(502);
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 404 }));
    expect((await call(env, "GET", "/api/tmdb/movie/1", undefined, token)).status).toBe(404);
  });
});
