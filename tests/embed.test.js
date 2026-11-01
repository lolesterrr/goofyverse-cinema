import { describe, it, expect } from "vitest";
import { cleanLink, parseLink } from "../src/lib/embed.js";

describe("jazz links", () => {
  it("only accepts http and https", () => {
    expect(cleanLink("javascript:alert(1)")).toBeNull();
    expect(cleanLink("data:text/html,hi")).toBeNull();
    expect(cleanLink("ftp://x.com/a.mp3")).toBeNull();
    expect(cleanLink("not a link")).toBeNull();
    expect(cleanLink("")).toBeNull();
    expect(cleanLink("https://example.com/" + "a".repeat(500))).toBeNull();
    expect(cleanLink("  https://example.com/a  ").href).toBe("https://example.com/a");
  });

  it("turns YouTube links of every shape into one privacy friendly embed", () => {
    for (const u of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ]) {
      expect(parseLink(u)).toMatchObject({ type: "youtube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
    }
    expect(parseLink("https://www.youtube.com/watch?v=short").type).toBe("link");
    expect(parseLink("https://www.youtube.com/").type).toBe("link");
    expect(parseLink("https://evil.com/watch?v=dQw4w9WgXcQ").type).toBe("link");
  });

  it("embeds Spotify tracks and albums at the right height", () => {
    expect(parseLink("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x")).toMatchObject({ type: "spotify", src: "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC", height: 152 });
    expect(parseLink("https://open.spotify.com/intl-fr/album/1weenld61qoidwYuZ1GESA")).toMatchObject({ type: "spotify", height: 352 });
    expect(parseLink("https://open.spotify.com/user/someone").type).toBe("link");
  });

  it("embeds SoundCloud tracks but not its home page", () => {
    const r = parseLink("https://soundcloud.com/artist/some-track");
    expect(r).toMatchObject({ type: "soundcloud", height: 166 });
    expect(r.src).toContain("https%3A%2F%2Fsoundcloud.com%2Fartist%2Fsome-track");
    expect(parseLink("https://soundcloud.com/artist").type).toBe("link");
  });

  it("plays direct audio and video and shows direct images", () => {
    expect(parseLink("https://files.example.com/a/b.MP3?dl=1").type).toBe("audio");
    expect(parseLink("https://files.example.com/clip.mp4").type).toBe("video");
    expect(parseLink("https://files.example.com/photo.jpeg").type).toBe("image");
    expect(parseLink("https://example.com/article").type).toBe("link");
    expect(parseLink("https://example.com/article").host).toBe("example.com");
  });
});
