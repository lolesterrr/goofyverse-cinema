import { useState } from "react";
import { api } from "../api.js";
import { useStore } from "../store.jsx";
import { explain } from "../lib/errors.js";
import { Says } from "../components/Layout.jsx";

/* First run: tell the site where the worker lives. */
export function Setup() {
  const { changeApi } = useStore();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [health, setHealth] = useState(null);
  const clean = url.trim().replace(/\/+$/, "");

  async function check(e) {
    e.preventDefault();
    setMsg("");
    setHealth(null);
    if (!/^https:\/\/\S+$/.test(clean) && !/^http:\/\/localhost(:\d+)?$/.test(clean)) {
      setMsg("The address should start with https:// and look like https://goofyverse-cinema.your-name.workers.dev");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${clean}/api/health`);
      const h = await res.json();
      if (!res.ok || !h.ok) throw new Error("not ours");
      setHealth(h);
      if (h.kv && h.auth) changeApi(clean);
    } catch {
      setMsg("I couldn't reach a Goofyverse worker there. Check the address, and that the worker allows this website (ALLOWED_ORIGINS).");
    }
    setBusy(false);
  }

  return (
    <main className="gate">
      <Says anim="shrug" scale={6}>
        Bonjour. I don't know where my worker lives yet. Paste its address and I'll go find it.
      </Says>
      <form className="gate-card form" onSubmit={check}>
        <h1>Connect the worker</h1>
        <label className="field">
          <span className="label">Worker address</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://goofyverse-cinema.your-name.workers.dev" required autoFocus />
        </label>
        {msg && <p className="notice" role="alert">{msg}</p>}
        {health && (!health.kv || !health.auth) && (
          <ul className="notice" role="alert">
            {!health.kv && <li>The worker has no KV namespace bound as GOOFY_KV.</li>}
            {!health.auth && <li>The worker is missing the PASSPHRASE or SIGNING_KEY secret.</li>}
          </ul>
        )}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Checking…" : "Connect"}
        </button>
        <p className="muted">The address is saved in this browser only. To bake it into the site for everyone, put it in .env.production.</p>
      </form>
    </main>
  );
}

/* Passphrase first, then pick who you are. No accounts. */
export function SignIn() {
  const { signIn } = useStore();
  const [passphrase, setPassphrase] = useState("");
  const [profiles, setProfiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function checkWord(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api.profiles(passphrase);
      setProfiles(r.profiles);
    } catch (error) {
      setErr(explain(error));
    }
    setBusy(false);
  }

  async function pick(name) {
    setBusy(true);
    setErr("");
    try {
      await signIn(passphrase, name);
    } catch (error) {
      setErr(explain(error));
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <Says anim={profiles ? "happy" : "bonjour"} scale={6} pettable>
        {profiles ? "Welcome. Who are you tonight?" : "Bonjour. What's the passphrase?"}
      </Says>
      <div className="gate-card">
        <h1>Goofyverse Cinema</h1>
        {!profiles ? (
          <form className="form" onSubmit={checkWord}>
            <label className="field">
              <span className="label">Passphrase</span>
              <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="current-password" required autoFocus />
            </label>
            {err && <p className="notice" role="alert">{err}</p>}
            <button type="submit" className="btn" disabled={busy}>
              {busy ? "Checking…" : "Come in"}
            </button>
          </form>
        ) : (
          <div className="form">
            <div className="profile-grid">
              {profiles.map((p) => (
                <button key={p} type="button" className="btn profile-btn" onClick={() => pick(p)} disabled={busy}>
                  {p}
                </button>
              ))}
            </div>
            {err && <p className="notice" role="alert">{err}</p>}
            <button type="button" className="link-btn" onClick={() => setProfiles(null)}>
              Back
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
