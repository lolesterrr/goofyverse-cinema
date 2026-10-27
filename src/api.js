import { apiBase } from "./config.js";

const SESSION_KEY = "gc.session";

export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (s && s.token && s.profile && s.exp > Date.now() / 1000) return s;
  } catch {
    /* no session */
  }
  return null;
}

export function setSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}

async function request(method, path, body, { auth = true } = {}) {
  const base = apiBase();
  if (!base) throw new ApiError(0, "no-api");
  const session = auth ? getSession() : null;
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (session) headers.authorization = `Bearer ${session.token}`;
  let res;
  try {
    res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "offline");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or not json */
  }
  if (!res.ok) {
    const code = (data && data.error) || `http-${res.status}`;
    if (res.status === 401 && session && code === "sign-in-needed") {
      clearSession();
      window.dispatchEvent(new Event("gc:signed-out"));
    }
    throw new ApiError(res.status, code);
  }
  return data;
}

const enc = encodeURIComponent;

export const api = {
  health: () => request("GET", "/api/health", undefined, { auth: false }),
  profiles: (passphrase) => request("POST", "/api/profiles", { passphrase }, { auth: false }),
  login: (passphrase, profile) => request("POST", "/api/login", { passphrase, profile }, { auth: false }),
  state: () => request("GET", "/api/state"),

  putDiary: (id, entry) => request("PUT", `/api/diary/${enc(id)}`, entry),
  delDiary: (id) => request("DELETE", `/api/diary/${enc(id)}`),
  putJazz: (id, entry) => request("PUT", `/api/jazz/${enc(id)}`, entry),
  delJazz: (id) => request("DELETE", `/api/jazz/${enc(id)}`),

  addWatch: (film) => request("POST", "/api/watchlist", film),
  delWatch: (id) => request("DELETE", `/api/watchlist/${enc(id)}`),

  putNight: (id, night) => request("PUT", `/api/nights/${enc(id)}`, night),
  rsvp: (id, status) => request("PUT", `/api/nights/${enc(id)}/rsvp`, { status }),
  delNight: (id) => request("DELETE", `/api/nights/${enc(id)}`),

  search: (q) => request("GET", `/api/tmdb/search?q=${enc(q)}`),
  trending: () => request("GET", "/api/tmdb/trending"),
  movie: (id) => request("GET", `/api/tmdb/movie/${enc(id)}`),
};
