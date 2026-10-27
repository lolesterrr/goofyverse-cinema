// Goofyverse Cinema worker. One file, no imports, so you can paste it into the
// Cloudflare dashboard or deploy it with wrangler (see README.md).
//
// Bindings:  GOOFY_KV      a KV namespace
// Variables: PROFILES      "Kensss,Goof" (comma separated, up to 8, add a friend here)
//            ALLOWED_ORIGINS  "https://lolesterrr.github.io" (comma separated)
// Secrets:   PASSPHRASE    the shared passphrase everybody types
//            SIGNING_KEY   long random string that signs session tokens
//            TMDB_TOKEN    your TMDB "API Read Access Token" (or a v3 API key)
//
// What lives where in KV:
//   u:<profile>:diary   that person's film log (only they write it)
//   u:<profile>:jazz    that person's jazz shelf entries (only they write it)
//   shared:watchlist    the shared watchlist
//   shared:nights       the shared movie nights

const DAY = 86400;
const TOKEN_TTL = 30 * DAY;
const MAX_BODY = 20000;
const MAX_ITEMS = 5000;
const DEFAULT_ORIGINS = ["https://lolesterrr.github.io", "http://localhost:5173"];
const enc = new TextEncoder();
const dec = new TextDecoder();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ---------- small helpers ---------- */

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const slug = (p) => p.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

function profilesOf(env) {
  return String(env.PROFILES || "Kensss,Goof")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function allowedOrigins(env) {
  const list = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return list.length ? list : DEFAULT_ORIGINS;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  if (!allowedOrigins(env).includes(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "too-big");
  if (!text) return {};
  try {
    const body = JSON.parse(text);
    if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return body;
  } catch {
    throw new HttpError(400, "bad-json");
  }
}

/* ---------- tokens and passphrase ---------- */

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signToken(env, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env.SIGNING_KEY), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

async function verifyToken(env, token) {
  try {
    const [body, sig] = String(token).split(".");
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env.SIGNING_KEY), fromB64u(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(fromB64u(body)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function safeEqual(a, b) {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b))),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function needConfig(env) {
  if (!env.GOOFY_KV) throw new HttpError(500, "kv-not-bound");
  if (!env.PASSPHRASE || !env.SIGNING_KEY) throw new HttpError(500, "secrets-missing");
}

// A shared passphrase is the only lock, so slow guessers down: 8 wrong tries per
// 15 minutes per address.
async function checkPassphrase(env, request, given) {
  needConfig(env);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const rlKey = `rl:${ip}`;
  const tries = Number(await env.GOOFY_KV.get(rlKey)) || 0;
  if (tries >= 8) throw new HttpError(429, "slow-down");
  const ok = typeof given === "string" && given.length > 0 && (await safeEqual(given, env.PASSPHRASE));
  if (!ok) {
    await env.GOOFY_KV.put(rlKey, String(tries + 1), { expirationTtl: 900 });
    throw new HttpError(401, "wrong-passphrase");
  }
}

async function authenticate(env, request) {
  needConfig(env);
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token ? await verifyToken(env, token) : null;
  if (!payload) throw new HttpError(401, "sign-in-needed");
  const me = profilesOf(env).find((p) => p === payload.p);
  if (!me) throw new HttpError(401, "sign-in-needed");
  return me;
}

/* ---------- validation ---------- */

function str(value, max, { required = false, name = "field" } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `${name}-required`);
    return "";
  }
  if (typeof value !== "string") throw new HttpError(400, `${name}-invalid`);
  const clean = value.trim();
  if (required && !clean) throw new HttpError(400, `${name}-required`);
  if (clean.length > max) throw new HttpError(400, `${name}-too-long`);
  return clean;
}

function intOrNull(value, min, max, name) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${name}-invalid`);
  return n;
}

function ratingOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!(n >= 0.5 && n <= 5) || Math.round(n * 2) !== n * 2) throw new HttpError(400, "rating-invalid");
  return n;
}

function idOf(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{6,40}$/.test(value)) throw new HttpError(400, "id-invalid");
  return value;
}

function dateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, "date-invalid");
  }
  return value;
}

const MEDIA = ["movie", "tv"];
const KINDS = ["movie", "series", "anime"];

// Anime is not a TMDB category, so call it anime when it is Japanese animation.
function deriveKind(media, isAnimation, language) {
  if (isAnimation && language === "ja") return "anime";
  return media === "tv" ? "series" : "movie";
}

function film(body) {
  const media = body.media ?? "movie";
  if (!MEDIA.includes(media)) throw new HttpError(400, "media-invalid");
  const kind = body.kind ?? (media === "tv" ? "series" : "movie");
  if (!KINDS.includes(kind)) throw new HttpError(400, "kind-invalid");
  const poster = body.poster ?? null;
  if (poster !== null && !(typeof poster === "string" && /^\/[A-Za-z0-9_.-]{1,80}$/.test(poster))) {
    throw new HttpError(400, "poster-invalid");
  }
  const genres = Array.isArray(body.genres) ? body.genres.slice(0, 8).map((g) => str(g, 40, { name: "genre" })) : [];
  const tmdbId = intOrNull(body.tmdbId, 1, 99999999, "tmdbId");
  if (!tmdbId) throw new HttpError(400, "tmdbId-required");
  return {
    tmdbId,
    media,
    kind,
    title: str(body.title, 200, { required: true, name: "title" }),
    year: intOrNull(body.year, 1870, 2200, "year"),
    poster,
    genres: genres.filter(Boolean),
    runtime: intOrNull(body.runtime, 1, 1500, "runtime"),
  };
}

/* ---------- KV ---------- */

const KEY = {
  diary: (p) => `u:${slug(p)}:diary`,
  jazz: (p) => `u:${slug(p)}:jazz`,
  watchlist: "shared:watchlist",
  nights: "shared:nights",
};

const load = async (env, key) => (await env.GOOFY_KV.get(key, "json")) || [];
const save = (env, key, list) => env.GOOFY_KV.put(key, JSON.stringify(list));

function upsert(list, entry) {
  const i = list.findIndex((x) => x.id === entry.id);
  if (i >= 0) list[i] = { ...list[i], ...entry };
  else {
    if (list.length >= MAX_ITEMS) throw new HttpError(400, "full");
    list.push(entry);
  }
  return list;
}

/* ---------- TMDB ---------- */

async function tmdb(env, path, params = {}) {
  if (!env.TMDB_TOKEN) throw new HttpError(503, "tmdb-not-configured");
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = { accept: "application/json" };
  // a v4 "read access token" is a long JWT, a v3 key is 32 hex characters
  if (env.TMDB_TOKEN.length > 60) headers.authorization = `Bearer ${env.TMDB_TOKEN}`;
  else url.searchParams.set("api_key", env.TMDB_TOKEN);
  const r = await fetch(url.toString(), { headers, cf: { cacheTtl: 3600, cacheEverything: true } });
  if (r.status === 404) throw new HttpError(404, "not-found");
  if (!r.ok) throw new HttpError(502, `tmdb-${r.status}`);
  return r.json();
}

const yearOf = (d) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

// Search, trending and detail results all come out in the same shape. `media` is
// what TMDB calls it (movie or tv); `kind` is what we show (movie, series, anime).
function briefFilm(m, mediaType) {
  const media = m.media_type || mediaType || "movie";
  return {
    tmdbId: m.id,
    media,
    kind: deriveKind(media, (m.genre_ids || []).includes(16), m.original_language),
    title: m.title || m.name || "",
    year: yearOf(m.release_date || m.first_air_date),
    poster: m.poster_path || null,
    overview: (m.overview || "").slice(0, 400),
    score: typeof m.vote_average === "number" ? Math.round(m.vote_average * 10) / 10 : null,
  };
}

const isAnimation = (genres = []) => genres.some((g) => g.name === "Animation");
const onlyMedia = (results = []) => results.filter((m) => !m.media_type || m.media_type === "movie" || m.media_type === "tv");

/* ---------- routes ---------- */

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;
  const parts = path.split("/").filter(Boolean); // ["api", ...]
  if (parts[0] !== "api") throw new HttpError(404, "not-found");
  const [, a, b, c] = parts;

  if (method === "GET" && a === "health" && !b) {
    return json({
      ok: true,
      kv: Boolean(env.GOOFY_KV),
      auth: Boolean(env.PASSPHRASE && env.SIGNING_KEY),
      tmdb: Boolean(env.TMDB_TOKEN),
    });
  }

  // Everything below the sign-in endpoints needs a token.
  if (method === "POST" && a === "profiles" && !b) {
    const body = await readBody(request);
    await checkPassphrase(env, request, body.passphrase);
    return json({ profiles: profilesOf(env) });
  }

  if (method === "POST" && a === "login" && !b) {
    const body = await readBody(request);
    await checkPassphrase(env, request, body.passphrase);
    const me = profilesOf(env).find((p) => p.toLowerCase() === String(body.profile || "").trim().toLowerCase());
    if (!me) throw new HttpError(400, "profile-unknown");
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL;
    return json({ token: await signToken(env, { p: me, exp }), profile: me, profiles: profilesOf(env), exp });
  }

  const me = await authenticate(env, request);

  if (method === "GET" && a === "state" && !b) {
    const profiles = profilesOf(env);
    const [diaries, jazzes, watchlist, nights] = await Promise.all([
      Promise.all(profiles.map((p) => load(env, KEY.diary(p)))),
      Promise.all(profiles.map((p) => load(env, KEY.jazz(p)))),
      load(env, KEY.watchlist),
      load(env, KEY.nights),
    ]);
    return json({
      me,
      profiles,
      diary: Object.fromEntries(profiles.map((p, i) => [p, diaries[i]])),
      jazz: Object.fromEntries(profiles.map((p, i) => [p, jazzes[i]])),
      watchlist,
      nights,
    });
  }

  // ----- diary (own entries only)
  if (a === "diary" && b && !c && (method === "PUT" || method === "DELETE")) {
    const id = idOf(b);
    const list = await load(env, KEY.diary(me));
    if (method === "DELETE") {
      await save(env, KEY.diary(me), list.filter((x) => x.id !== id));
      return json({ ok: true });
    }
    const body = await readBody(request);
    const existing = list.find((x) => x.id === id);
    const f = film(body);
    const entry = {
      id,
      ...f,
      // a season only means something for a show
      season: f.media === "tv" ? intOrNull(body.season, 1, 100, "season") : null,
      rating: ratingOrNull(body.rating),
      review: str(body.review, 4000, { name: "review" }),
      watchedOn: dateOnly(body.watchedOn),
      together: Boolean(body.together),
      rewatch: Boolean(body.rewatch),
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    await save(env, KEY.diary(me), upsert(list, entry));
    return json({ entry });
  }

  // ----- jazz shelf (own entries only)
  if (a === "jazz" && b && !c && (method === "PUT" || method === "DELETE")) {
    const id = idOf(b);
    const list = await load(env, KEY.jazz(me));
    if (method === "DELETE") {
      await save(env, KEY.jazz(me), list.filter((x) => x.id !== id));
      return json({ ok: true });
    }
    const body = await readBody(request);
    const existing = list.find((x) => x.id === id);
    const entry = {
      id,
      title: str(body.title, 200, { required: true, name: "title" }),
      category: str(body.category, 30, { required: true, name: "category" }).toLowerCase(),
      by: str(body.by, 120, { name: "by" }),
      rating: ratingOrNull(body.rating),
      review: str(body.review, 4000, { name: "review" }),
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    await save(env, KEY.jazz(me), upsert(list, entry));
    return json({ entry });
  }

  // ----- watchlist (shared)
  if (a === "watchlist" && !b && method === "POST") {
    const body = await readBody(request);
    const f = film(body);
    const list = await load(env, KEY.watchlist);
    // a film and a show can share a TMDB number, so the media type is part of the identity
    const already = list.find((x) => x.tmdbId === f.tmdbId && (x.media || "movie") === f.media);
    if (already) return json({ item: already, already: true });
    const item = { id: newId(), ...f, note: str(body.note, 200, { name: "note" }), addedBy: me, addedAt: nowIso() };
    await save(env, KEY.watchlist, upsert(list, item));
    return json({ item }, 201);
  }
  if (a === "watchlist" && b && !c && method === "DELETE") {
    const id = idOf(b);
    const list = await load(env, KEY.watchlist);
    await save(env, KEY.watchlist, list.filter((x) => x.id !== id));
    return json({ ok: true });
  }

  // ----- movie nights (shared)
  if (a === "nights" && b && !c && (method === "PUT" || method === "DELETE")) {
    const id = idOf(b);
    const list = await load(env, KEY.nights);
    if (method === "DELETE") {
      await save(env, KEY.nights, list.filter((x) => x.id !== id));
      return json({ ok: true });
    }
    const body = await readBody(request);
    const when = new Date(body.when);
    if (typeof body.when !== "string" || Number.isNaN(when.getTime())) throw new HttpError(400, "when-invalid");
    const status = body.status === "done" ? "done" : "planned";
    const existing = list.find((x) => x.id === id);
    const profiles = profilesOf(env);
    const rsvp = existing?.rsvp || Object.fromEntries(profiles.map((p) => [p, p === me ? "in" : "maybe"]));
    const night = {
      id,
      ...film(body),
      when: when.toISOString(),
      place: str(body.place, 120, { name: "place" }),
      note: str(body.note, 300, { name: "note" }),
      status,
      rsvp,
      createdBy: existing?.createdBy || me,
      createdAt: existing?.createdAt || nowIso(),
    };
    await save(env, KEY.nights, upsert(list, night));
    return json({ night });
  }
  if (a === "nights" && b && c === "rsvp" && method === "PUT") {
    const id = idOf(b);
    const body = await readBody(request);
    if (!["in", "out", "maybe"].includes(body.status)) throw new HttpError(400, "status-invalid");
    const list = await load(env, KEY.nights);
    const night = list.find((x) => x.id === id);
    if (!night) throw new HttpError(404, "not-found");
    night.rsvp = { ...night.rsvp, [me]: body.status };
    await save(env, KEY.nights, list);
    return json({ night });
  }

  // ----- TMDB proxy (keeps the key out of the browser)
  if (method === "GET" && a === "tmdb") {
    if (b === "search" && !c) {
      const q = str(url.searchParams.get("q"), 100, { required: true, name: "q" });
      // films, shows and anime all come from one search; people are filtered out
      const data = await tmdb(env, "/search/multi", { query: q, include_adult: "false", language: "en-US" });
      return json({ results: onlyMedia(data.results).filter((m) => m.media_type).slice(0, 20).map((m) => briefFilm(m)) });
    }
    if (b === "trending" && !c) {
      const data = await tmdb(env, "/trending/all/week", { language: "en-US" });
      return json({ results: onlyMedia(data.results).slice(0, 20).map((m) => briefFilm(m)) });
    }
    if (b === "movie" && c) {
      const id = intOrNull(c, 1, 99999999, "id");
      if (!id) throw new HttpError(400, "id-invalid");
      const m = await tmdb(env, `/movie/${id}`, { language: "en-US", append_to_response: "credits" });
      const directors = ((m.credits && m.credits.crew) || []).filter((x) => x.job === "Director").map((x) => x.name);
      return json({
        ...briefFilm(m, "movie"),
        kind: deriveKind("movie", isAnimation(m.genres), m.original_language),
        backdrop: m.backdrop_path || null,
        tagline: m.tagline || "",
        genres: (m.genres || []).map((g) => g.name),
        runtime: m.runtime || null,
        directors: directors.slice(0, 3),
        overview: (m.overview || "").slice(0, 1200),
      });
    }
    if (b === "tv" && c) {
      const id = intOrNull(c, 1, 99999999, "id");
      if (!id) throw new HttpError(400, "id-invalid");
      const m = await tmdb(env, `/tv/${id}`, { language: "en-US" });
      return json({
        ...briefFilm(m, "tv"),
        kind: deriveKind("tv", isAnimation(m.genres), m.original_language),
        backdrop: m.backdrop_path || null,
        tagline: m.tagline || "",
        genres: (m.genres || []).map((g) => g.name),
        // minutes per episode are not a runtime for the whole show, so none is stored
        runtime: null,
        creators: ((m.created_by) || []).map((x) => x.name).slice(0, 3),
        seasons: m.number_of_seasons || null,
        episodes: m.number_of_episodes || null,
        overview: (m.overview || "").slice(0, 1200),
      });
    }
  }

  throw new HttpError(404, "not-found");
}

export async function handle(request, env) {
  const cors = corsHeaders(request, env);
  if (cors === null) return json({ error: "origin-not-allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const res = await route(request, env);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status, cors);
    console.error(err);
    return json({ error: "server" }, 500, cors);
  }
}

export default { fetch: handle };
