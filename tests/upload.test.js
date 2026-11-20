import { describe, it, expect, vi, beforeEach } from "vitest";
import { MB } from "../src/lib/files.js";

const calls = { single: [], start: [], part: [], finish: [], abort: [] };
let partBehaviour = () => ({ ok: true });

vi.mock("../src/api.js", () => ({
  api: {
    uploadFile: async (blob, type, name, { signal } = {}) => {
      if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      calls.single.push({ size: blob.size, type, name });
      return { file: { key: `kensss/single.${type.split("/")[1]}`, type, size: blob.size, name } };
    },
    startUpload: async (type, size, name) => {
      calls.start.push({ type, size, name });
      const partSize = 12 * MB;
      return { token: "ticket", partSize, parts: Math.ceil(size / partSize) };
    },
    uploadPart: async (token, n, blob, { signal } = {}) => {
      if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      calls.part.push({ n, size: blob.size });
      const outcome = partBehaviour(n, calls.part.filter((p) => p.n === n).length);
      if (outcome?.throw) throw outcome.throw;
      return { part: { partNumber: n, etag: `etag-${n}` } };
    },
    finishUpload: async (token, parts) => {
      calls.finish.push(parts);
      return { file: { key: "kensss/joined.mp4", type: "video/mp4", size: 30 * MB, name: "film.mp4" } };
    },
    abortUpload: async (token) => calls.abort.push(token),
  },
}));

const { Cancelled, uploadFile } = await import("../src/lib/upload.js");

const fakeBlob = (size) => ({ size, slice: (a, b) => ({ size: b - a }) });
const fail = (status) => Object.assign(new Error(String(status)), { status, code: `http-${status}` });

beforeEach(() => {
  for (const k of Object.keys(calls)) calls[k] = [];
  partBehaviour = () => ({ ok: true });
});

describe("uploading a file", () => {
  it("sends a small file in one go", async () => {
    const file = await uploadFile(fakeBlob(2 * MB), "audio/mpeg", "song.mp3");
    expect(calls.single).toHaveLength(1);
    expect(calls.start).toHaveLength(0);
    expect(file.name).toBe("song.mp3");
  });

  it("sends a big video in pieces and reports progress", async () => {
    const seen = [];
    const file = await uploadFile(fakeBlob(30 * MB), "video/mp4", "film.mp4", { onProgress: (p) => seen.push(`${p.done}/${p.total}`) });
    expect(calls.start[0]).toEqual({ type: "video/mp4", size: 30 * MB, name: "film.mp4" });
    expect(calls.part.map((p) => p.n)).toEqual([1, 2, 3]);
    expect(calls.part.map((p) => p.size)).toEqual([12 * MB, 12 * MB, 6 * MB]); // last piece is the remainder
    expect(calls.finish[0]).toEqual([
      { partNumber: 1, etag: "etag-1" },
      { partNumber: 2, etag: "etag-2" },
      { partNumber: 3, etag: "etag-3" },
    ]);
    expect(seen).toEqual(["0/3", "1/3", "2/3", "3/3"]);
    expect(file.key).toBe("kensss/joined.mp4");
    expect(calls.abort).toHaveLength(0);
  });

  it("keeps big photos in one request, since only songs and videos chunk", async () => {
    await uploadFile(fakeBlob(30 * MB), "image/jpeg", "big.jpg");
    expect(calls.single).toHaveLength(1);
    expect(calls.start).toHaveLength(0);
  });

  it("tries a dropped piece again instead of losing the whole upload", async () => {
    partBehaviour = (n, attempt) => (n === 2 && attempt < 3 ? { throw: fail(attempt === 1 ? 0 : 502) } : { ok: true });
    const file = await uploadFile(fakeBlob(30 * MB), "video/mp4", "film.mp4", { retryDelay: 1 });
    expect(calls.part.filter((p) => p.n === 2)).toHaveLength(3);
    expect(file.key).toBe("kensss/joined.mp4");
  });

  it("gives up on a piece the worker refuses, and tells R2 to throw the rest away", async () => {
    partBehaviour = (n) => (n === 2 ? { throw: fail(413) } : { ok: true });
    await expect(uploadFile(fakeBlob(30 * MB), "video/mp4", "film.mp4", { retryDelay: 1 })).rejects.toMatchObject({ status: 413 });
    expect(calls.part.filter((p) => p.n === 2)).toHaveLength(1); // not retried
    expect(calls.finish).toHaveLength(0);
    expect(calls.abort).toEqual(["ticket"]);
  });

  it("gives up after enough failed tries", async () => {
    partBehaviour = () => ({ throw: fail(500) });
    await expect(uploadFile(fakeBlob(30 * MB), "video/mp4", "film.mp4", { retryDelay: 1 })).rejects.toMatchObject({ status: 500 });
    expect(calls.part).toHaveLength(5);
    expect(calls.abort).toEqual(["ticket"]);
  });

  it("stops where it is when you cancel", async () => {
    const controller = new AbortController();
    partBehaviour = (n) => {
      if (n === 2) controller.abort();
      return { ok: true };
    };
    await expect(uploadFile(fakeBlob(30 * MB), "video/mp4", "film.mp4", { signal: controller.signal })).rejects.toBeInstanceOf(Cancelled);
    expect(calls.part.map((p) => p.n)).toEqual([1, 2]); // never starts piece 3
    expect(calls.finish).toHaveLength(0);
    expect(calls.abort).toEqual(["ticket"]);
  });

  it("cancels while waiting to retry", async () => {
    const controller = new AbortController();
    partBehaviour = (n) => {
      if (n === 1) setTimeout(() => controller.abort(), 5);
      return { throw: fail(503) };
    };
    await expect(uploadFile(fakeBlob(30 * MB), "video/mp4", "film.mp4", { signal: controller.signal, retryDelay: 200 })).rejects.toBeInstanceOf(Cancelled);
    expect(calls.abort).toEqual(["ticket"]);
  });
});
