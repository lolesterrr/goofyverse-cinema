// What the Jazz shelf accepts as an upload. Keep in step with FILE_TYPES in worker/index.js.
export const MB = 1024 * 1024;
export const MAX_FILES = 4;
// Above this, songs and videos go up in chunks (see upload.js).
export const SINGLE_MAX = 25 * MB;
const BIGGEST_PHOTO_BEFORE_SHRINKING = 40 * MB;

export const FILE_TYPES = {
  "image/jpeg": { kind: "image", mb: 15 },
  "image/png": { kind: "image", mb: 15 },
  "image/gif": { kind: "image", mb: 15 },
  "image/webp": { kind: "image", mb: 15 },
  "image/avif": { kind: "image", mb: 15 },
  "audio/mpeg": { kind: "audio", mb: 500 },
  "audio/mp4": { kind: "audio", mb: 500 },
  "audio/x-m4a": { kind: "audio", mb: 500 },
  "audio/aac": { kind: "audio", mb: 500 },
  "audio/wav": { kind: "audio", mb: 500 },
  "audio/x-wav": { kind: "audio", mb: 500 },
  "audio/ogg": { kind: "audio", mb: 500 },
  "audio/flac": { kind: "audio", mb: 500 },
  "video/mp4": { kind: "video", mb: 5120 },
  "video/webm": { kind: "video", mb: 5120 },
  "video/quicktime": { kind: "video", mb: 5120 },
};

const BY_EXTENSION = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", flac: "audio/flac",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

// Phones sometimes leave the type blank, so fall back to the file ending.
export function typeOf(file) {
  const declared = String(file?.type || "").toLowerCase();
  if (FILE_TYPES[declared]) return declared;
  const ext = /\.([a-z0-9]+)$/i.exec(file?.name || "")?.[1]?.toLowerCase();
  return BY_EXTENSION[ext] || null;
}

export const kindOfType = (type) => FILE_TYPES[type]?.kind || null;

// Which photo does which job on a jazz card. Each slot falls back to something
// sensible, so an entry saved before any of this still looks right.
export const imagesOf = (entry) => (entry?.files || []).filter((f) => kindOfType(f.type) === "image");

const pick = (entry, slot) => {
  const key = entry?.art?.[slot];
  return key ? imagesOf(entry).find((f) => f.key === key) || null : null;
};

// the big one, shown whole: the one you chose, else the first photo
export const coverOf = (entry) => pick(entry, "cover") || imagesOf(entry).find((f) => f.key !== entry?.art?.label) || null;
// the little round one on the record: only if you chose it
export const labelOf = (entry) => pick(entry, "label");
// blurred behind the card: the one you chose, else the cover, unless you turned it off
export const wallOf = (entry) => (entry?.art?.wallOff ? null : pick(entry, "wall") || coverOf(entry));

export function fmtLimit(mb) {
  return mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`;
}

export function fmtSize(bytes) {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// A plain sentence for the first problem with a picked file, or null if it's fine.
export function checkFile(file) {
  const name = file.name || "That file";
  const type = typeOf(file);
  if (!type) return `${name} isn't a photo, song or video I can store.`;
  if (!file.size) return `${name} is empty.`;
  const kind = FILE_TYPES[type].kind;
  const limit = kind === "image" ? BIGGEST_PHOTO_BEFORE_SHRINKING : FILE_TYPES[type].mb * MB;
  if (file.size > limit) return `${name} is too big. ${kind === "image" ? "Photos" : kind === "audio" ? "Songs" : "Videos"} can be up to ${fmtLimit(Math.round(limit / MB))}.`;
  return null;
}

// Phone photos are huge, so shrink them in the browser before they go up.
// Anything that can't be shrunk goes up as it is.
export async function prepare(file, { maxSide = 2000 } = {}) {
  const type = typeOf(file);
  const canShrink = ["image/jpeg", "image/png", "image/webp"].includes(type);
  if (!canShrink || typeof createImageBitmap !== "function" || typeof document === "undefined") return { blob: file, type };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 2 * MB) {
      bitmap.close?.();
      return { blob: file, type };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const out = await new Promise((resolve) => canvas.toBlob(resolve, type === "image/jpeg" ? "image/jpeg" : "image/webp", 0.85));
    if (out && FILE_TYPES[out.type] && out.size < file.size) return { blob: out, type: out.type };
  } catch {
    /* fall through to the original */
  }
  return { blob: file, type };
}

// After shrinking, the real limit for the stored kind applies.
export function checkPrepared(blob, type, name = "That file") {
  const spec = FILE_TYPES[type];
  if (!spec || blob.size > spec.mb * MB) return `${name} is still too big (limit ${spec ? fmtLimit(spec.mb) : "0 MB"}).`;
  return null;
}
