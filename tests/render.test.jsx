import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { StoreContext } from "../src/store.jsx";
import Home from "../src/pages/Home.jsx";
import Diary from "../src/pages/Diary.jsx";
import Watchlist from "../src/pages/Watchlist.jsx";
import Nights from "../src/pages/Nights.jsx";
import Jazz from "../src/pages/Jazz.jsx";
import Us from "../src/pages/Us.jsx";
import { Setup, SignIn } from "../src/pages/Gate.jsx";
import ModalHost from "../src/components/ModalHost.jsx";
import { Footer, Header, Toast } from "../src/components/Layout.jsx";
import { StarInput, Stars } from "../src/components/Stars.jsx";
import Pierre from "../src/components/Pierre.jsx";

const noop = async () => {};

const film = (tmdbId, title, year) => ({ tmdbId, title, year, poster: "/p.jpg", genres: ["Drama", "Music"], runtime: 106 });
const log = (id, f, rating, watchedOn, extra = {}) => ({
  id, ...f, rating, review: `Thoughts on ${f.title}.`, watchedOn, together: true, rewatch: false, createdAt: `${watchedOn}T10:00:00Z`, ...extra,
});

const whiplash = film(1, "Whiplash", 2014);
const paprika = film(2, "Paprika", 2006);
const heat = film(3, "Heat", 1995);
const soon = new Date(Date.now() + 3 * 86400000).toISOString();

const sample = {
  me: "Kensss",
  profiles: ["Kensss", "Goof"],
  diary: {
    Kensss: [log("a1", whiplash, 4.5, "2026-10-20"), log("a2", paprika, 1.5, "2026-10-22", { together: false })],
    Goof: [log("b1", whiplash, 4, "2026-10-20"), log("b2", heat, null, "2026-09-01")],
  },
  jazz: {
    Kensss: [{ id: "j1", title: "Kind of Blue", category: "album", by: "Miles Davis", rating: 5, review: "Perfect.", createdAt: "2026-10-01T10:00:00Z" }],
    Goof: [{ id: "j2", title: "Hades", category: "game", by: "", rating: 4, review: "", createdAt: "2026-10-02T10:00:00Z" }],
  },
  watchlist: [{ id: "w1", ...heat, note: "friday", addedBy: "Goof", addedAt: "2026-10-01T10:00:00Z" }],
  nights: [
    { id: "n1", ...paprika, when: soon, place: "my place", note: "snacks", status: "planned", rsvp: { Kensss: "in", Goof: "maybe" }, createdBy: "Kensss" },
    { id: "n2", ...heat, when: "2026-09-01T18:00:00.000Z", place: "", note: "", status: "done", rsvp: { Kensss: "in", Goof: "in" }, createdBy: "Goof" },
  ],
};

const empty = { me: "Kensss", profiles: ["Kensss", "Goof"], diary: { Kensss: [], Goof: [] }, jazz: { Kensss: [], Goof: [] }, watchlist: [], nights: [] };

function ctx(data, extra = {}) {
  return {
    apiUrl: "https://worker.test", session: { profile: "Kensss" }, me: "Kensss", data, status: "ready", error: null,
    refresh: noop, changeApi: () => {}, signIn: noop, signOut: () => {},
    saveDiary: noop, removeDiary: noop, saveJazz: noop, removeJazz: noop, addToWatchlist: noop, removeFromWatchlist: noop,
    saveNight: noop, rsvp: noop, removeNight: noop,
    toast: null, say: () => {}, modal: null, openModal: () => {}, closeModal: () => {},
    ...extra,
  };
}

const render = (ui, data = sample, extra = {}) =>
  renderToString(
    <MemoryRouter>
      <StoreContext.Provider value={ctx(data, extra)}>{ui}</StoreContext.Provider>
    </MemoryRouter>,
  );

describe("pages with data", () => {
  it("home shows the next night, the queue, the programme, jazz and taste", () => {
    const html = render(<Home />);
    expect(html).toContain("NOW SHOWING, JUST FOR US");
    expect(html).toContain("Paprika");
    expect(html).toContain("Tickets in the queue");
    expect(html).toContain("Heat");
    expect(html).toContain("The programme");
    expect(html).toContain("Whiplash");
    expect(html).toContain("Kind of Blue");
    expect(html).toContain("Taste match");
    expect(html).toContain("%");
  });

  it("diary lists everyone's takes, and one person's months", () => {
    const html = render(<Diary />);
    expect(html).toContain("Whiplash");
    expect(html).toContain("Goof");
    expect(html).toContain("Thoughts on Whiplash.");
  });

  it("watchlist, nights, jazz and us all render", () => {
    expect(render(<Watchlist />)).toContain("Plan a night");
    const nights = render(<Nights />);
    expect(nights).toContain("Past nights");
    expect(nights).toContain("Watched together");
    const jazz = render(<Jazz />);
    expect(jazz).toContain("Kind of Blue");
    expect(jazz).toContain("Hades");
    const us = render(<Us />);
    expect(us).toContain("agree, within half a star");
    expect(us).toContain("Complaint desk");
    expect(us).toContain("Year in review");
  });
});

describe("empty states", () => {
  it("every page has something kind to say with no data", () => {
    expect(render(<Home />, empty)).toContain("No movie night planned");
    expect(render(<Diary />, empty)).toContain("The diary is empty");
    expect(render(<Watchlist />, empty)).toContain("Nothing queued");
    expect(render(<Nights />, empty)).toContain("No night on the calendar");
    expect(render(<Jazz />, empty)).toContain("The shelf is bare");
    const us = render(<Us />, empty);
    expect(us).toContain("haven&#x27;t rated the same film yet");
    expect(us).toContain("No complaints");
  });

  it("shows loading and error states instead of crashing", () => {
    expect(render(<Home />, null, { status: "loading" })).toContain("Fetching the reels");
    const err = render(<Home />, null, { status: "error", error: { code: "offline" } });
    expect(err).toContain("can&#x27;t reach the worker");
  });
});

describe("gate, layout and dialogs", () => {
  it("renders the setup and sign in screens", () => {
    expect(render(<Setup />, null)).toContain("Connect the worker");
    expect(render(<SignIn />, null)).toContain("Passphrase");
  });

  it("renders the header, footer and a toast", () => {
    const header = render(<Header />);
    expect(header).toContain("Goofyverse Cinema");
    expect(header).toContain("Log a film");
    expect(render(<Footer />)).toContain("TMDB");
    expect(render(<Toast />, sample, { toast: { text: "Magnifique.", mood: "happy", key: 1 } })).toContain("Magnifique.");
  });

  it("renders every dialog type", () => {
    const open = (type, props = {}) => render(<ModalHost />, sample, { modal: { type, props } });
    expect(open("log", { film: whiplash })).toContain("Your rating");
    expect(open("log", { entry: sample.diary.Kensss[0] })).toContain("Delete log");
    expect(open("night", { film: paprika })).toContain("Book the night");
    expect(open("night", { night: sample.nights[0] })).toContain("Cancel night");
    expect(open("jazz")).toContain("Put it on the shelf");
    expect(open("jazz", { entry: sample.jazz.Kensss[0] })).toContain("Delete entry");
    expect(open("queue")).toContain("Search for a film");
    expect(open("film", { film: whiplash })).toContain("Log it");
    expect(open("log")).toContain("Search for a film");
  });

  it("renders stars, the star input and Pierre", () => {
    expect(render(<Stars value={4.5} />)).toContain("★★★★½");
    expect(render(<Stars value={null} />)).toContain("Not rated");
    const input = render(<StarInput value={2.5} onChange={() => {}} />);
    expect(input).toContain("2.5 / 5");
    expect(input).toContain("star-glyph half");
    expect(render(<Pierre anim="bonjour" scale={5} />)).toContain("Monsieur Pierre, waving hello in his red beret");
  });
});
