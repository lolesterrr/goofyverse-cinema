import { NavLink } from "react-router-dom";
import { useStore } from "../store.jsx";
import Pierre from "./Pierre.jsx";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/diary", label: "Diary" },
  { to: "/watchlist", label: "Watchlist" },
  { to: "/nights", label: "Movie night" },
  { to: "/jazz", label: "Jazz" },
  { to: "/us", label: "Us" },
];

export function Header() {
  const { me, signOut, openModal } = useStore();
  return (
    <header className="site-header">
      <NavLink to="/" className="brand" aria-label="Goofyverse Cinema, home">
        <Pierre anim="beret" scale={2} />
        <span className="brand-name">Goofyverse Cinema</span>
      </NavLink>
      <nav className="nav" aria-label="Main">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <button type="button" className="btn small" onClick={() => openModal("log")}>
        Log something
      </button>
      <details className="who">
        <summary>{me}</summary>
        <div className="who-menu">
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </details>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <p>
        Made for two friends and one cat. Monsieur Pierre lives at{" "}
        <a href="https://github.com/lolesterrr/oneko-woah" target="_blank" rel="noreferrer">
          oneko-woah
        </a>
        .
      </p>
      <p className="muted">
        This product uses the{" "}
        <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
          TMDB
        </a>{" "}
        API but is not endorsed or certified by TMDB.
      </p>
    </footer>
  );
}

export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite" key={toast.key}>
      <Pierre anim={toast.mood} scale={3} />
      <div className="bubble">{toast.text}</div>
    </div>
  );
}

// Pierre next to a speech bubble, used for greetings and empty states.
export function Says({ anim = "idle", scale = 5, pettable = false, children, className = "" }) {
  return (
    <div className={`says ${className}`}>
      <Pierre anim={anim} scale={scale} pettable={pettable} />
      <div className="bubble">{children}</div>
    </div>
  );
}

export function Empty({ anim = "sleep", children, action }) {
  return (
    <div className="empty">
      <Pierre anim={anim} scale={4} />
      <div className="empty-text">
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}

export function Marquee({ children, className = "" }) {
  return (
    <section className={`marquee ${className}`}>
      <div className="bulbs" aria-hidden="true" />
      <div className="marquee-body">{children}</div>
      <div className="bulbs" aria-hidden="true" />
    </section>
  );
}
