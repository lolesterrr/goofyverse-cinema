// Turns a pasted link into something a Jazz card can show.
// Only http(s) links are ever accepted, and embeds only come from three known hosts.

const AUDIO = /\.(mp3|m4a|wav|ogg|oga|flac|aac)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v)$/i;
const IMAGE = /\.(jpe?g|png|gif|webp|avif)$/i;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY = new Set(["track", "album", "playlist", "episode", "show", "artist"]);

export function cleanLink(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 500) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url;
}

function youtubeId(url) {
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1];
  }
  return id && YT_ID.test(id) ? id : null;
}

// -> { type: "youtube"|"spotify"|"soundcloud"|"audio"|"video"|"image"|"link", href, src?, height?, host } or null
export function parseLink(value) {
  const url = cleanLink(value);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "");
  const base = { href: url.href, host };

  const yt = youtubeId(url);
  if (yt) return { ...base, type: "youtube", src: `https://www.youtube-nocookie.com/embed/${yt}`, ratio: "16 / 9" };

  if (host === "open.spotify.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const at = parts.findIndex((p) => SPOTIFY.has(p));
    const id = at >= 0 ? parts[at + 1] : null;
    if (id && /^[A-Za-z0-9]{10,30}$/.test(id)) {
      const kind = parts[at];
      return { ...base, type: "spotify", src: `https://open.spotify.com/embed/${kind}/${id}`, height: kind === "track" || kind === "episode" ? 152 : 352 };
    }
  }

  if (host === "soundcloud.com" && url.pathname.split("/").filter(Boolean).length >= 2) {
    return { ...base, type: "soundcloud", src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&visual=false`, height: 166 };
  }

  if (AUDIO.test(url.pathname)) return { ...base, type: "audio", src: url.href };
  if (VIDEO.test(url.pathname)) return { ...base, type: "video", src: url.href };
  if (IMAGE.test(url.pathname)) return { ...base, type: "image", src: url.href };
  return { ...base, type: "link" };
}
