import { api } from "../api.js";
import { SINGLE_MAX, kindOfType } from "./files.js";

export class Cancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "Cancelled";
  }
}

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Cancelled());
      },
      { once: true },
    );
  });

// A dropped connection or a worker hiccup on one chunk shouldn't sink a 3 GB upload:
// try that chunk again, waiting a little longer each time.
async function retrying(job, { signal, retryDelay = 1000 }) {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new Cancelled();
    try {
      return await job();
    } catch (error) {
      if (error?.name === "AbortError" || signal?.aborted) throw new Cancelled();
      const transient = error && (error.status === 0 || error.status >= 500);
      if (!transient || attempt >= 4) throw error;
      await wait(retryDelay * 2 ** attempt, signal);
    }
  }
}

// Small files go up in one request. Big songs and videos go up in chunks, because a
// free worker takes at most 100 MB per request. Returns the file record to attach.
export async function uploadFile(blob, type, name, { onProgress = () => {}, signal, retryDelay } = {}) {
  const big = blob.size > SINGLE_MAX && ["audio", "video"].includes(kindOfType(type));
  if (!big) {
    const { file } = await api.uploadFile(blob, type, name, { signal });
    return file;
  }

  // keep the phone awake while a big file is going up (best effort)
  let lock = null;
  try {
    lock = (await navigator.wakeLock?.request("screen")) || null;
  } catch {
    /* not supported, or refused */
  }

  let token = null;
  try {
    const started = await api.startUpload(type, blob.size, name);
    token = started.token;
    const { partSize, parts } = started;
    const receipts = [];
    onProgress({ done: 0, total: parts });
    for (let n = 1; n <= parts; n++) {
      const piece = blob.slice((n - 1) * partSize, Math.min(n * partSize, blob.size));
      const { part } = await retrying(() => api.uploadPart(token, n, piece, { signal }), { signal, retryDelay });
      receipts.push(part);
      onProgress({ done: n, total: parts });
    }
    const { file } = await retrying(() => api.finishUpload(token, receipts), { signal, retryDelay });
    return file;
  } catch (error) {
    if (token) api.abortUpload(token).catch(() => {}); // let R2 throw away the pieces
    throw error;
  } finally {
    try {
      await lock?.release();
    } catch {
      /* already released */
    }
  }
}
