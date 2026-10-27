// Where the worker lives. The built-in value comes from .env.production
// (VITE_API_BASE). Until that is filled in, the setup screen lets you paste the
// address, and it is remembered in this browser only.
const KEY = "gc.api";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function apiBase() {
  const saved = read(KEY);
  return String(saved || import.meta.env.VITE_API_BASE || "").trim().replace(/\/+$/, "");
}

export function saveApiBase(url) {
  try {
    if (url) localStorage.setItem(KEY, url.trim().replace(/\/+$/, ""));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the address just won't be remembered */
  }
}
