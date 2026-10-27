const pad = (n) => String(n).padStart(2, "0");

export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "2026-10-20" is a calendar day, not a moment, so build it in local time.
export function fmtDay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const fmtWhen = (iso) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// How far away a movie night is. A night counts as "showing now" for three hours.
export function countdown(iso, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  if (diff > 0) {
    const days = Math.floor(diff / DAY);
    if (days >= 2) return { state: "future", big: String(days), unit: "days" };
    const hours = Math.floor(diff / HOUR);
    if (hours >= 2) return { state: "future", big: String(hours), unit: "hours" };
    return { state: "future", big: String(Math.max(1, Math.floor(diff / MIN))), unit: "minutes" };
  }
  if (diff > -3 * HOUR) return { state: "now", big: "Now", unit: "showing" };
  const ago = Math.floor(-diff / DAY);
  return { state: "past", big: ago < 1 ? "Today" : String(ago), unit: ago < 1 ? "earlier" : ago === 1 ? "day ago" : "days ago" };
}

export const toLocalInput = (iso) => {
  const d = new Date(iso);
  return `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromLocalInput = (value) => new Date(value).toISOString();

export function defaultNightInput(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Bonjour.";
  if (h < 18) return "Bon après-midi.";
  return "Bonsoir.";
}
