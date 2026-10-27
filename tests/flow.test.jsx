// @vitest-environment jsdom
// End to end: the real React app, talking to the real worker code, with fake KV and a stubbed TMDB.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { webcrypto } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { handle } from "../worker/index.js";
import { StoreProvider } from "../src/store.jsx";
import App from "../src/App.jsx";

class FakeKV {
  constructor() { this.map = new Map(); }
  async get(key, type) { const v = this.map.get(key); return v === undefined ? null : type === "json" ? JSON.parse(v) : v; }
  async put(key, value) { this.map.set(key, String(value)); }
}

const PASS = "open sesame";
const MANIFEST = readFileSync(join(process.cwd(), "public/pierre/pierre.json"), "utf8");

const WHIPLASH = { id: 244786, title: "Whiplash", release_date: "2014-10-10", poster_path: "/w.jpg", overview: "A young drummer meets a terrifying teacher.", vote_average: 8.4 };
const DETAIL = {
  ...WHIPLASH, backdrop_path: "/b.jpg", tagline: "", runtime: 106,
  genres: [{ name: "Drama" }, { name: "Music" }], credits: { crew: [{ job: "Director", name: "Damien Chazelle" }] },
};

let env;
let realFetch;

function installFetch() {
  globalThis.fetch = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input), "https://lolesterrr.github.io/");
    if (url.pathname.endsWith("/pierre/pierre.json")) return new Response(MANIFEST, { status: 200 });
    if (url.hostname === "api.themoviedb.org") {
      if (url.pathname.startsWith("/3/movie/")) return new Response(JSON.stringify(DETAIL), { status: 200 });
      return new Response(JSON.stringify({ results: [WHIPLASH] }), { status: 200 });
    }
    if (url.hostname === "worker.test") {
      const headers = { ...(init.headers || {}), origin: "https://lolesterrr.github.io" };
      return handle(new Request(url.toString(), { method: init.method || "GET", headers, body: init.body }), env);
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

function mount() {
  return render(
    <MemoryRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </MemoryRouter>,
  );
}

beforeAll(() => {
  vi.stubGlobal("crypto", webcrypto);
  // jsdom has <dialog> but not showModal/close
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("gc.api", "https://worker.test");
  env = { GOOFY_KV: new FakeKV(), PASSPHRASE: PASS, SIGNING_KEY: "k".repeat(40), PROFILES: "Kensss,Goof", ALLOWED_ORIGINS: "https://lolesterrr.github.io", TMDB_TOKEN: "x".repeat(120) };
  realFetch = globalThis.fetch;
  installFetch();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

async function signInAs(user, name) {
  await user.type(await screen.findByLabelText(/passphrase/i), PASS);
  await user.click(screen.getByRole("button", { name: /come in/i }));
  await user.click(await screen.findByRole("button", { name }));
  await screen.findByText(/no movie night planned/i);
}

describe("the whole app against the real worker", () => {
  it("asks for the worker address on first run and checks it", async () => {
    localStorage.clear();
    const user = userEvent.setup();
    mount();
    await user.type(await screen.findByLabelText(/worker address/i), "https://worker.test");
    await user.click(screen.getByRole("button", { name: /connect/i }));
    expect(await screen.findByLabelText(/passphrase/i)).toBeTruthy();
    expect(localStorage.getItem("gc.api")).toBe("https://worker.test");
  });

  it("rejects a wrong passphrase with a friendly message", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(await screen.findByLabelText(/passphrase/i), "nope");
    await user.click(screen.getByRole("button", { name: /come in/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/isn't the passphrase/i);
  });

  it("signs in, logs a film with a rating, and shows it in the diary and in storage", async () => {
    const user = userEvent.setup();
    mount();
    await signInAs(user, "Kensss");

    // the header button comes first; the empty-state hero has one too
    await user.click(screen.getAllByRole("button", { name: "Log a film" })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: /whiplash/i }));
    await user.click(await within(dialog).findByRole("button", { name: "4.5 stars" }));
    await user.type(within(dialog).getByLabelText(/review/i), "Stressful in the best way.");
    await user.click(within(dialog).getByRole("button", { name: "Log it" }));

    expect(await screen.findByText("Magnifique.")).toBeTruthy(); // Pierre's reaction to 4.5 stars
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("link", { name: "Diary" }));
    expect(await screen.findByText("Stressful in the best way.")).toBeTruthy();
    expect(screen.getAllByText("Whiplash").length).toBeGreaterThan(0);

    const saved = JSON.parse(env.GOOFY_KV.map.get("u:kensss:diary"));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ tmdbId: 244786, rating: 4.5, genres: ["Drama", "Music"], runtime: 106 });
  });

  it("queues a film, plans a movie night from it and RSVPs", async () => {
    const user = userEvent.setup();
    mount();
    await signInAs(user, "Goof");

    await user.click(screen.getByRole("link", { name: "Watchlist" }));
    await user.click(await screen.findByRole("button", { name: "Add a film" }));
    const add = await screen.findByRole("dialog");
    await user.click(await within(add).findByRole("button", { name: /whiplash/i }));
    expect(await screen.findByText("Added to the queue.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(JSON.parse(env.GOOFY_KV.map.get("shared:watchlist"))[0].addedBy).toBe("Goof");

    await user.click(await screen.findByRole("button", { name: "Plan a night" }));
    const night = await screen.findByRole("dialog");
    await user.click(within(night).getByRole("button", { name: "Book the night" }));
    expect(await screen.findByText("Movie night is on.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("link", { name: "Movie night" }));
    expect(await screen.findByText("NOW SHOWING, JUST FOR US")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Maybe" }));
    const stored = JSON.parse(env.GOOFY_KV.map.get("shared:nights"));
    expect(stored).toHaveLength(1);
    expect(stored[0].rsvp).toEqual({ Goof: "maybe", Kensss: "maybe" }); // Goof created it, so "in" first, then Maybe
  });

  it("adds a jazz shelf entry and signs out", async () => {
    const user = userEvent.setup();
    mount();
    await signInAs(user, "Kensss");

    await user.click(screen.getByRole("link", { name: "Jazz" }));
    await user.click(await screen.findByRole("button", { name: "Add to the shelf" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/what is it/i), "Kind of Blue");
    await user.click(within(dialog).getByRole("button", { name: "5 stars" }));
    await user.click(within(dialog).getByRole("button", { name: "Put it on the shelf" }));
    expect(await screen.findByText("On the shelf.")).toBeTruthy();
    expect(JSON.parse(env.GOOFY_KV.map.get("u:kensss:jazz"))[0]).toMatchObject({ title: "Kind of Blue", category: "album", rating: 5 });

    await user.click(screen.getByText("Kensss", { selector: "summary" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByLabelText(/passphrase/i)).toBeTruthy();
    expect(localStorage.getItem("gc.session")).toBeNull();
  });

  it("shows each friend's takes together once both have logged the same film", async () => {
    const user = userEvent.setup();
    mount();
    await signInAs(user, "Kensss");
    // Goof logs the same film straight through the worker
    const login = await (await fetch("https://worker.test/api/login", { method: "POST", body: JSON.stringify({ passphrase: PASS, profile: "Goof" }) })).json();
    await fetch("https://worker.test/api/diary/goof-whiplash", {
      method: "PUT",
      headers: { authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ tmdbId: 244786, title: "Whiplash", year: 2014, poster: "/w.jpg", genres: ["Drama"], runtime: 106, rating: 4, review: "The last ten minutes, wow.", watchedOn: "2026-10-20" }),
    });
    // Kensss's tab comes back into view, which is when the app looks for the other person's changes
    document.dispatchEvent(new Event("visibilitychange"));
    await user.click(screen.getByRole("link", { name: "Diary" }));
    expect(await screen.findByText("The last ten minutes, wow.")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /^Goof$/ }));
    expect(await screen.findByText("The last ten minutes, wow.")).toBeTruthy();
  });
});
