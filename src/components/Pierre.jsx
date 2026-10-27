import { useEffect, useState } from "react";

// Monsieur Pierre's sprite sheet and animation list come from the MMA site
// (32px frames, 8 columns). Same idea as its pierre.js, as a React component.
const BASE = import.meta.env.BASE_URL;
const SHEET = `${BASE}pierre/pierre.png`;
const MANIFEST = `${BASE}pierre/pierre.json`;

let manifestPromise = null;
function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST)
      .then((r) => r.json())
      .then((m) => {
        const used = Object.values(m.anims).flatMap((a) => a.frames);
        m.rows = Math.ceil((Math.max(...used) + 1) / m.cols);
        return m;
      })
      .catch(() => null);
  }
  return manifestPromise;
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const LABELS = {
  idle: "sitting around",
  beret: "wearing his red beret",
  wave: "waving",
  bonjour: "waving hello in his red beret",
  search: "searching with a magnifying glass",
  popcorn: "eating popcorn",
  spin: "turning in circles",
  walk: "walking",
  sleep: "asleep",
  knock: "pushing a mug off the table",
  stamp: "stamping a complaint",
  read: "reading a complaint with his glasses on",
  happy: "looking pleased",
  sad: "looking sad",
  shrug: "shrugging",
  think: "thinking",
  peek: "peeking over the edge",
  clap: "snapping a clapperboard",
  ticket: "holding up a cinema ticket",
};

/**
 * <Pierre anim="bonjour" scale={6} />
 * `pettable` makes him a button: a click makes him spin once.
 */
export default function Pierre({ anim = "idle", scale = 4, pettable = false, className = "" }) {
  const [manifest, setManifest] = useState(null);
  const [frame, setFrame] = useState(null);
  const [burst, setBurst] = useState(null);

  useEffect(() => {
    let alive = true;
    loadManifest().then((m) => alive && setManifest(m));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!manifest) return undefined;
    const a = manifest.anims[burst || anim] || manifest.anims.idle;
    if (reducedMotion()) {
      setFrame(a.frames[0]);
      return undefined;
    }
    let i = 0;
    let timer = 0;
    let alive = true;
    const step = () => {
      if (!alive) return;
      setFrame(a.frames[i]);
      const ms = a.ms[i] ?? 200;
      i += 1;
      if (i >= a.frames.length) {
        if (burst) {
          timer = setTimeout(() => alive && setBurst(null), ms);
          return;
        }
        i = 0;
      }
      timer = setTimeout(step, ms);
    };
    step();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [manifest, anim, burst]);

  const style = { "--s": scale };
  if (manifest && frame !== null) {
    style["--cols"] = manifest.cols;
    style["--rows"] = manifest.rows;
    style["--col"] = frame % manifest.cols;
    style["--row"] = Math.floor(frame / manifest.cols);
    style.backgroundImage = `url(${SHEET})`;
  }
  const label = `Monsieur Pierre, ${LABELS[burst || anim] || anim}`;

  if (pettable) {
    return (
      <button type="button" className={`pierre-btn ${className}`} onClick={() => setBurst("spin")} aria-label={`${label}. Click to pet him.`}>
        <span className="pierre" style={style} aria-hidden="true" />
      </button>
    );
  }
  return <span className={`pierre ${className}`} style={style} role="img" aria-label={label} />;
}
