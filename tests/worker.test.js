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

// Just enough of an R2 bucket: put, head, get (with ranges), delete.
class FakeR2 {
  constructor() {
    this.map = new Map();
  }
  async put(key, body, opts = {}) {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    this.map.set(key, { bytes, httpMetadata: opts.httpMetadata || {} });
  }
  async head(key) {
    const o = this.map.get(key);
    return o ? { size: o.bytes.length, httpMetadata: o.httpMetadata } : null;
  }
  async get(key, opts = {}) {
    const o = this.map.get(key);
    if (!o) return null;
    const size = o.bytes.length;
    const m = /^bytes=(\d*)-(\d*)$/.exec(opts.range?.get?.("range") || "");
    if (!m) return { size, httpMetadata: o.httpMetadata, body: new Blob([o.bytes]).stream() };
    const start = m[1] === "" ? Math.max(size - Number(m[2]), 0) : Number(m[1]);
    const end = m[1] === "" ? size - 1 : Math.min(m[2] === "" ? size - 1 : Number(m[2]), size - 1);
    return { size, httpMetadata: o.httpMetadata, range: { offset: start, length: end - start + 1 }, body: new Blob([o.bytes.slice(start, end + 1)]).stream() };
  }
  async delete(keys) {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.map.delete(k);
  }
  uploads = new Map();
  async createMultipartUpload(key, opts = {}) {
    const uploadId = `up-${this.uploads.size + 1}-${Math.random().toString(36).slice(2)}`;
    this.uploads.set(uploadId, { key, meta: opts.httpMetadata || {}, parts: new Map() });
    return { uploadId, key };
  }
  resumeMultipartUpload(key, uploadId) {
    const up = this.uploads.get(uploadId);
    const bucket = this;
    const need = () => {
      if (!up || up.key !== key) throw new Error("no such upload");
    };
    return {
      async uploadPart(n, value) {
        need();
        const bytes = new Uint8Array(await new Response(value).arrayBuffer());
        const etag = `etag-${n}-${bytes.length}`;
        up.parts.set(n, { bytes, etag });
        return { partNumber: n, etag };
      },
      async complete(parts) {
        need();
        const chunks = parts.map((p) => {
          const got = up.parts.get(p.partNumber);
          if (!got || got.etag !== p.etag) throw new Error("bad part");
          return got.bytes;
        });
        const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let at = 0;
        for (const c of chunks) {
          all.set(c, at);
          at += c.length;
        }
        bucket.map.set(key, { bytes: all, httpMetadata: up.meta });
        bucket.uploads.delete(uploadId);
        return { size: all.length };
      },
      async abort() {
        need();
        bucket.uploads.delete(uploadId);
      },
    };
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

async function rawCall(env, method, path, bytes, token, headers = {}) {
  const init = { method, headers: { origin: ORIGIN, ...headers } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (bytes !== undefined) init.body = bytes;
  const res = await handle(new Request(`https://worker.test${path}`, init), env);
  return res;
}

async function upload(env, token, type, size = 1000, name = "song.mp3") {
  const bytes = new Uint8Array(size).map((_, i) => i % 251);
  const res = await rawCall(env, "POST", "/api/files", bytes, token, { "content-type": type, "content-length": String(size), "x-file-name": encodeURIComponent(name) });
  return { status: res.status, body: await res.json(), bytes };
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
    expect(r.body).toEqual({ ok: true, kv: true, auth: true, tmdb: false, files: false });
    expect((await call(makeEnv({ JAZZ_FILES: new FakeR2() }), "GET", "/api/health")).body.files).toBe(true);
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

  it("keeps an optional link and refuses anything that isn't http(s)", async () => {
    const env = makeEnv();
    const kens = await signIn(env, "Kensss");
    const ok = await call(env, "PUT", "/api/jazz/jazz-link", { title: "Song", category: "track", link: " https://youtu.be/dQw4w9WgXcQ " }, kens);
    expect(ok.status).toBe(200);
    expect(ok.body.entry.link).toBe("https://youtu.be/dQw4w9WgXcQ");
    const none = await call(env, "PUT", "/api/jazz/jazz-nolink", { title: "Song 2", category: "track" }, kens);
    expect(none.body.entry.link).toBe("");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://a.com/x.mp3", "nope", 5]) {
      const r = await call(env, "PUT", "/api/jazz/jazz-bad", { title: "X", category: "track", link: bad }, kens);
      expect(r.status).toBe(400);
      expect(r.body.error).toMatch(/^link-/);
    }
    const long = await call(env, "PUT", "/api/jazz/jazz-long", { title: "X", category: "track", link: "https://a.com/" + "x".repeat(500) }, kens);
    expect(long.body.error).toBe("link-too-long");
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

describe("jazz file uploads", () => {
  const filesEnv = () => makeEnv({ JAZZ_FILES: new FakeR2() });

  it("stores a file, hands back an address, and serves it without a token", async () => {
    const env = filesEnv();
    const kens = await signIn(env, "Kensss");
    const up = await upload(env, kens, "audio/mpeg", 2000, "Blue in Green.mp3");
    expect(up.status).toBe(201);
    expect(up.body.file).toMatchObject({ type: "audio/mpeg", size: 2000, name: "Blue in Green.mp3" });
    expect(up.body.file.key).toMatch(/^kensss\/[A-Za-z0-9_-]{24}\.mp3$/);

    const res = await rawCall(env, "GET", `/api/files/${up.body.file.key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("2000");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(up.bytes);
  });

  it("supports range requests so audio and video can seek", async () => {
    const env = filesEnv();
    const kens = await signIn(env, "Kensss");
    const up = await upload(env, kens, "video/mp4", 1000, "clip.mp4");
    const res = await rawCall(env, "GET", `/api/files/${up.body.file.key}`, undefined, undefined, { range: "bytes=100-199" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(res.headers.get("content-length")).toBe("100");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(up.bytes.slice(100, 200));
    const tail = await rawCall(env, "GET", `/api/files/${up.body.file.key}`, undefined, undefined, { range: "bytes=-50" });
    expect(tail.headers.get("content-range")).toBe("bytes 950-999/1000");
  });

  it("needs a sign in to upload, and refuses wrong types, empty bodies and big files", async () => {
    const env = filesEnv();
    const kens = await signIn(env, "Kensss");
    expect((await upload(env, undefined, "audio/mpeg")).status).toBe(401);
    for (const bad of ["text/html", "image/svg+xml", "application/pdf", "application/javascript"]) {
      const r = await upload(env, kens, bad);
      expect(r.status).toBe(415);
      expect(r.body.error).toBe("file-type");
    }
    expect((await upload(env, kens, "image/jpeg", 16 * 1024 * 1024)).body.error).toBe("file-too-big");
    const big = await rawCall(env, "POST", "/api/files", new Uint8Array(5), kens, { "content-type": "audio/mpeg", "content-length": String(91 * 1024 * 1024) });
    expect(big.status).toBe(413); // over 90 MB has to go up in chunks
    const none = await rawCall(env, "POST", "/api/files", new Uint8Array(5), kens, { "content-type": "audio/mpeg", "content-length": "0" });
    expect(none.status).toBe(411);
    expect(env.JAZZ_FILES.map.size).toBe(0);
  });

  it("says so when the bucket isn't connected", async () => {
    const env = makeEnv();
    const kens = await signIn(env, "Kensss");
    const r = await upload(env, kens, "audio/mpeg");
    expect(r.status).toBe(503);
    expect(r.body.error).toBe("files-not-bound");
    const put = await call(env, "PUT", "/api/jazz/jazz-plain", { title: "No files", category: "track" }, kens);
    expect(put.status).toBe(200); // an entry with no files never needs the bucket
  });

  it("attaches files to an entry, only your own, and cleans up what you remove", async () => {
    const env = filesEnv();
    const kens = await signIn(env, "Kensss");
    const goof = await signIn(env, "Goof");
    const a = (await upload(env, kens, "image/png", 100, "cover.png")).body.file;
    const b = (await upload(env, kens, "audio/mpeg", 100, "song.mp3")).body.file;
    const theirs = (await upload(env, goof, "audio/mpeg", 100, "goof.mp3")).body.file;

    const put = await call(env, "PUT", "/api/jazz/jazz-files", { title: "Mix", category: "album", files: [a, b] }, kens);
    expect(put.status).toBe(200);
    expect(put.body.entry.files.map((f) => f.key)).toEqual([a.key, b.key]);

    // can't point at somebody else's file, a made-up one, or the same one twice
    for (const files of [[theirs], [{ key: "kensss/AAAAAAAAAAAAAAAAAAAAAAAA.mp3", name: "x" }], [a, a], "nope", [{ key: "../goof/x" }]]) {
      const r = await call(env, "PUT", "/api/jazz/jazz-files", { title: "Mix", category: "album", files }, kens);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("files-invalid");
    }
    const many = [a, b, a, b, a].map((f, i) => ({ ...f, key: f.key + i }));
    expect((await call(env, "PUT", "/api/jazz/jazz-files", { title: "Mix", category: "album", files: many }, kens)).body.error).toBe("too-many-files");

    // leaving files out keeps them; sending a shorter list deletes the dropped one from the bucket
    const keep = await call(env, "PUT", "/api/jazz/jazz-files", { title: "Mix v2", category: "album" }, kens);
    expect(keep.body.entry.files).toHaveLength(2);
    await call(env, "PUT", "/api/jazz/jazz-files", { title: "Mix v2", category: "album", files: [a] }, kens);
    expect(env.JAZZ_FILES.map.has(`jazz/${b.key}`)).toBe(false);
    expect(env.JAZZ_FILES.map.has(`jazz/${a.key}`)).toBe(true);

    // deleting the entry deletes its files
    await call(env, "DELETE", "/api/jazz/jazz-files", undefined, kens);
    expect(env.JAZZ_FILES.map.has(`jazz/${a.key}`)).toBe(false);
    expect(env.JAZZ_FILES.map.has(`jazz/${theirs.key}`)).toBe(true);
  });

  it("lets you delete an upload you never saved, but not somebody else's or one in use", async () => {
    const env = filesEnv();
    const kens = await signIn(env, "Kensss");
    const goof = await signIn(env, "Goof");
    const loose = (await upload(env, kens, "audio/mpeg", 100)).body.file;
    const used = (await upload(env, kens, "audio/mpeg", 100)).body.file;
    await call(env, "PUT", "/api/jazz/jazz-used", { title: "Used", category: "track", files: [used] }, kens);

    expect((await call(env, "DELETE", `/api/files/${loose.key}`, undefined, goof)).status).toBe(404);
    expect((await call(env, "DELETE", `/api/files/${used.key}`, undefined, kens)).status).toBe(409);
    expect((await call(env, "DELETE", `/api/files/${loose.key}`, undefined, kens)).status).toBe(200);
    expect(env.JAZZ_FILES.map.has(`jazz/${loose.key}`)).toBe(false);
    expect(env.JAZZ_FILES.map.has(`jazz/${used.key}`)).toBe(true);
  });

  it("404s for bad or missing file addresses", async () => {
    const env = filesEnv();
    expect((await rawCall(env, "GET", "/api/files/kensss/nope.mp3")).status).toBe(404);
    expect((await rawCall(env, "GET", "/api/files/KENSSS/AAAAAAAAAAAAAAAAAAAAAAAA.mp3")).status).toBe(404);
    expect((await rawCall(env, "GET", "/api/files/kensss/AAAAAAAAAAAAAAAAAAAAAAAA.mp3")).status).toBe(404);
  });
});

describe("chunked uploads for big songs and videos", () => {
  const MB = 1024 * 1024;
  const chunkedEnv = () => makeEnv({ JAZZ_FILES: new FakeR2(), PART_SIZE_MB: "5" });
  const start = (env, token, body) => call(env, "POST", "/api/files/multipart", body, token);
  const sendPart = (env, token, ticket, n, bytes) =>
    rawCall(env, "PUT", `/api/files/multipart/${n}`, bytes, token, { "content-type": "application/octet-stream", "content-length": String(bytes.length), "x-upload-token": ticket });
  const finish = (env, token, ticket, parts) => call(env, "POST", "/api/files/multipart/complete", { parts }, token, { "x-upload-token": ticket });
  const pattern = (size) => new Uint8Array(size).map((_, i) => (i * 7) % 251);

  it("uploads a file in pieces, joins them, and serves the whole thing", async () => {
    const env = chunkedEnv();
    const kens = await signIn(env, "Kensss");
    const size = 12 * MB; // 5 + 5 + 2
    const data = pattern(size);
    const s = await start(env, kens, { type: "video/mp4", size, name: "long film.mp4" });
    expect(s.status).toBe(201);
    expect(s.body).toMatchObject({ partSize: 5 * MB, parts: 3 });

    const receipts = [];
    // out of order on purpose: the order the receipts are sent back in is what counts
    for (const n of [2, 1, 3]) {
      const res = await sendPart(env, kens, s.body.token, n, data.slice((n - 1) * 5 * MB, Math.min(n * 5 * MB, size)));
      expect(res.status).toBe(200);
      receipts.push((await res.json()).part);
    }
    const done = await finish(env, kens, s.body.token, receipts);
    expect(done.status).toBe(201);
    expect(done.body.file).toMatchObject({ type: "video/mp4", size, name: "long film.mp4" });
    expect(done.body.file.key).toMatch(/^kensss\/[A-Za-z0-9_-]{24}\.mp4$/);

    const res = await rawCall(env, "GET", `/api/files/${done.body.file.key}`, undefined, undefined, { range: `bytes=${5 * MB - 2}-${5 * MB + 1}` });
    expect(res.status).toBe(206);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(data.slice(5 * MB - 2, 5 * MB + 2)); // seeks across a join

    const put = await call(env, "PUT", "/api/jazz/jazz-big", { title: "Big", category: "other", files: [done.body.file] }, kens);
    expect(put.status).toBe(200);
    expect(put.body.entry.files[0].size).toBe(size);
  });

  it("refuses sizes and types that don't belong", async () => {
    const env = chunkedEnv();
    const kens = await signIn(env, "Kensss");
    expect((await start(env, kens, { type: "video/mp4", size: 5121 * MB })).body.error).toBe("file-too-big");
    expect((await start(env, kens, { type: "audio/mpeg", size: 501 * MB })).body.error).toBe("file-too-big");
    expect((await start(env, kens, { type: "video/mp4", size: 5120 * MB, name: "ok.mp4" })).status).toBe(201); // exactly 5 GB is fine
    expect((await start(env, kens, { type: "image/jpeg", size: 6 * MB })).body.error).toBe("file-type");
    expect((await start(env, kens, { type: "text/html", size: 6 * MB })).body.error).toBe("file-type");
    for (const size of [0, -5, 1.5, "lots", null]) expect((await start(env, kens, { type: "video/mp4", size })).body.error).toBe("size-invalid");
    expect((await call(env, "POST", "/api/files/multipart", { type: "video/mp4", size: 6 * MB })).status).toBe(401); // needs a sign in
  });

  it("checks every piece against the ticket", async () => {
    const env = chunkedEnv();
    const kens = await signIn(env, "Kensss");
    const goof = await signIn(env, "Goof");
    const s = await start(env, kens, { type: "audio/mpeg", size: 12 * MB, name: "x.mp3" });
    const t = s.body.token;
    expect((await sendPart(env, kens, t, 1, pattern(4 * MB))).status).toBe(400); // not full size
    expect((await sendPart(env, kens, t, 3, pattern(3 * MB))).status).toBe(400); // last piece has the wrong size
    expect((await sendPart(env, kens, t, 4, pattern(5 * MB))).status).toBe(400); // there is no piece 4
    expect((await sendPart(env, kens, t, 0, pattern(5 * MB))).status).toBe(400);
    expect((await sendPart(env, kens, t, "abc", pattern(5 * MB))).status).toBe(400);
    expect((await sendPart(env, kens, t, 1, pattern(6 * MB))).status).toBe(413); // bigger than a piece may be
    expect(await (await sendPart(env, goof, t, 1, pattern(5 * MB))).json()).toEqual({ error: "upload-expired" }); // somebody else's ticket
    expect((await sendPart(env, kens, "garbage", 1, pattern(5 * MB))).status).toBe(401);
    expect((await sendPart(env, kens, kens, 1, pattern(5 * MB))).status).toBe(401); // a sign-in token isn't a ticket
    const asLogin = await call(env, "GET", "/api/state", undefined, t); // and a ticket isn't a sign-in token
    expect(asLogin.status).toBe(401);
    expect((await sendPart(env, kens, t, 1, pattern(5 * MB))).status).toBe(200);
  });

  it("won't finish with missing, repeated or made-up receipts", async () => {
    const env = chunkedEnv();
    const kens = await signIn(env, "Kensss");
    const s = await start(env, kens, { type: "audio/mpeg", size: 7 * MB, name: "y.mp3" });
    const t = s.body.token;
    const one = (await (await sendPart(env, kens, t, 1, pattern(5 * MB))).json()).part;
    expect((await finish(env, kens, t, [one])).body.error).toBe("parts-invalid"); // piece 2 never sent
    const two = (await (await sendPart(env, kens, t, 2, pattern(2 * MB))).json()).part;
    expect((await finish(env, kens, t, [one, one])).body.error).toBe("parts-invalid");
    expect((await finish(env, kens, t, [one, { partNumber: 2, etag: "made-up" }])).body.error).toBe("parts-invalid");
    expect((await finish(env, kens, t, "nope")).body.error).toBe("parts-invalid");
    expect(env.JAZZ_FILES.map.size).toBe(0);
    expect((await finish(env, kens, t, [one, two])).status).toBe(201);
    expect(env.JAZZ_FILES.map.size).toBe(1);
  });

  it("cancels an upload and drops what was sent", async () => {
    const env = chunkedEnv();
    const kens = await signIn(env, "Kensss");
    const s = await start(env, kens, { type: "video/mp4", size: 6 * MB, name: "z.mp4" });
    const t = s.body.token;
    expect((await sendPart(env, kens, t, 1, pattern(5 * MB))).status).toBe(200);
    expect((await call(env, "DELETE", "/api/files/multipart", undefined, kens, { "x-upload-token": t })).status).toBe(200);
    expect(env.JAZZ_FILES.uploads.size).toBe(0);
    expect((await sendPart(env, kens, t, 2, pattern(1 * MB))).status).toBe(400); // too late
    expect(env.JAZZ_FILES.map.size).toBe(0);
  });
});
