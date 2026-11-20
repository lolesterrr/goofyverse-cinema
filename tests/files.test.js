import { describe, it, expect } from "vitest";
import { MB, checkFile, checkPrepared, fmtSize, kindOfType, prepare, typeOf } from "../src/lib/files.js";

const file = (name, type, size = 1000) => ({ name, type, size });

describe("upload rules", () => {
  it("works out the type, even when the phone leaves it blank", () => {
    expect(typeOf(file("a.mp3", "audio/mpeg"))).toBe("audio/mpeg");
    expect(typeOf(file("song.M4A", ""))).toBe("audio/mp4");
    expect(typeOf(file("IMG_1.jpeg", ""))).toBe("image/jpeg");
    expect(typeOf(file("clip.mov", ""))).toBe("video/quicktime");
    expect(typeOf(file("notes.pdf", "application/pdf"))).toBeNull();
    expect(typeOf(file("page.html", "text/html"))).toBeNull();
    expect(typeOf(file("pic.svg", "image/svg+xml"))).toBeNull();
    expect(kindOfType("audio/mpeg")).toBe("audio");
    expect(kindOfType("video/webm")).toBe("video");
    expect(kindOfType("image/png")).toBe("image");
    expect(kindOfType("text/html")).toBeNull();
  });

  it("explains the first problem with a picked file", () => {
    expect(checkFile(file("ok.mp3", "audio/mpeg"))).toBeNull();
    expect(checkFile(file("notes.pdf", "application/pdf"))).toMatch(/isn't a photo, song or video/);
    expect(checkFile(file("empty.mp3", "audio/mpeg", 0))).toMatch(/is empty/);
    expect(checkFile(file("big.mp3", "audio/mpeg", 31 * MB))).toMatch(/Songs can be up to 30 MB/);
    expect(checkFile(file("big.mp4", "video/mp4", 61 * MB))).toMatch(/Videos can be up to 60 MB/);
    expect(checkFile(file("raw.jpg", "image/jpeg", 30 * MB))).toBeNull(); // photos are shrunk before the real limit applies
    expect(checkFile(file("huge.jpg", "image/jpeg", 41 * MB))).toMatch(/Photos can be up to 40 MB/);
  });

  it("applies the stored limit after shrinking", () => {
    expect(checkPrepared({ size: 2 * MB }, "image/jpeg")).toBeNull();
    expect(checkPrepared({ size: 16 * MB }, "image/jpeg")).toMatch(/still too big/);
    expect(checkPrepared({ size: 10 }, "text/html")).toMatch(/still too big/);
  });

  it("leaves files alone when there's no canvas to shrink them with", async () => {
    const f = file("a.png", "image/png", 9 * MB);
    expect(await prepare(f)).toEqual({ blob: f, type: "image/png" });
    const song = file("a.mp3", "audio/mpeg");
    expect(await prepare(song)).toEqual({ blob: song, type: "audio/mpeg" });
  });

  it("writes sizes people can read", () => {
    expect(fmtSize(500)).toBe("1 KB");
    expect(fmtSize(150 * 1024)).toBe("150 KB");
    expect(fmtSize(3.5 * MB)).toBe("3.5 MB");
    expect(fmtSize(25 * MB)).toBe("25 MB");
  });
});
