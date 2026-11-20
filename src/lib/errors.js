const TEXT = {
  "no-api": "This site doesn't know where its worker lives yet.",
  offline: "I can't reach the worker. Check the address and your connection.",
  "wrong-passphrase": "That isn't the passphrase.",
  "slow-down": "Too many wrong tries. Wait fifteen minutes and try again.",
  "profile-unknown": "I don't know that name.",
  "sign-in-needed": "Your session ran out. Please sign in again.",
  "tmdb-not-configured": "The worker has no TMDB key yet. Add the TMDB_TOKEN secret to it.",
  "kv-not-bound": "The worker isn't connected to its KV storage yet.",
  "secrets-missing": "The worker is missing its PASSPHRASE or SIGNING_KEY secret.",
  "origin-not-allowed": "The worker doesn't allow this website yet. Add its address to ALLOWED_ORIGINS.",
  "not-found": "I couldn't find that.",
  "rating-invalid": "Ratings go from half a star to five stars.",
  "date-invalid": "That date doesn't look right.",
  "when-invalid": "Pick a date and time for the night.",
  "link-invalid": "That link doesn't look right. It should start with https://",
  "link-too-long": "That link is too long.",
  "size-invalid": "That file's size doesn't look right.",
  "upload-expired": "That upload timed out. Add the file again.",
  "part-invalid": "A piece of that upload didn't go through. Add the file again.",
  "parts-invalid": "That upload didn't finish properly. Add the file again.",
  "files-not-bound": "The worker isn't connected to its file storage yet. Add the JAZZ_FILES binding.",
  "file-type": "I can only store photos, songs and videos.",
  "file-too-big": "That file is too big.",
  "too-many-files": "Four files per entry is the limit.",
  "files-invalid": "One of those files didn't save properly. Remove it and add it again.",
  "length-required": "That file couldn't be sent. Try another one.",
  "file-in-use": "That file is still attached to something.",
  "title-required": "It needs a title.",
  "category-required": "Pick a category, even a silly one.",
  "review-too-long": "That review is too long. Keep it under 4000 characters.",
  full: "That list is full.",
  "too-big": "That's too much to send in one go.",
  server: "The worker had a problem. Try again in a moment.",
};

export function explain(err) {
  const code = (err && err.code) || "";
  if (TEXT[code]) return TEXT[code];
  if (code.startsWith("tmdb-")) return "TMDB isn't answering right now. Try again in a minute.";
  return "Something went wrong. Try again.";
}
