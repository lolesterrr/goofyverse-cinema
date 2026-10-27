import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, clearSession, getSession, setSession } from "./api.js";
import { apiBase, saveApiBase } from "./config.js";

export const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

const newId = () => crypto.randomUUID();

const upsertById = (list = [], item) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = [...list];
  next[i] = { ...next[i], ...item };
  return next;
};
const removeById = (list = [], id) => list.filter((x) => x.id !== id);

const POLL_MS = 45000;

export function StoreProvider({ children }) {
  const [apiUrl, setApiUrl] = useState(apiBase());
  const [session, setSessionState] = useState(getSession());
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const toastTimer = useRef(0);
  const hasData = useRef(false);

  const say = useCallback((text, mood = "happy") => {
    clearTimeout(toastTimer.current);
    setToast({ text, mood, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!getSession()) return;
    if (!hasData.current && !quiet) setStatus("loading");
    try {
      const next = await api.state();
      hasData.current = true;
      setData(next);
      setStatus("ready");
      setError(null);
    } catch (e) {
      if (e.code === "sign-in-needed") return;
      if (!hasData.current) {
        setStatus("error");
        setError(e);
      }
    }
  }, []);

  // load when somebody signs in, forget everything when they sign out
  useEffect(() => {
    if (session) {
      refresh();
    } else {
      hasData.current = false;
      setData(null);
      setStatus("idle");
    }
  }, [session, refresh]);

  // pick up what the other person did, every so often and when the tab comes back
  useEffect(() => {
    if (!session) return undefined;
    const tick = () => document.visibilityState === "visible" && refresh(true);
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [session, refresh]);

  useEffect(() => {
    const out = () => setSessionState(null);
    window.addEventListener("gc:signed-out", out);
    return () => window.removeEventListener("gc:signed-out", out);
  }, []);

  const signIn = useCallback(async (passphrase, profile) => {
    const r = await api.login(passphrase, profile);
    const next = { token: r.token, profile: r.profile, exp: r.exp };
    setSession(next);
    setSessionState(next);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSessionState(null);
    setModal(null);
  }, []);

  const changeApi = useCallback((url) => {
    saveApiBase(url);
    clearSession();
    setSessionState(null);
    setApiUrl(apiBase());
  }, []);

  const me = session ? session.profile : null;

  const patch = useCallback((fn) => setData((d) => (d ? fn(d) : d)), []);

  /* ----- diary ----- */
  const saveDiary = useCallback(
    async (entry) => {
      const who = getSession().profile;
      const id = entry.id || newId();
      const full = { ...entry, id, createdAt: entry.createdAt || new Date().toISOString() };
      patch((d) => ({ ...d, diary: { ...d.diary, [who]: upsertById(d.diary[who], full) } }));
      try {
        const { entry: saved } = await api.putDiary(id, full);
        patch((d) => ({ ...d, diary: { ...d.diary, [who]: upsertById(d.diary[who], saved) } }));
        if (saved.rating == null) say("Logged.", "clap");
        else if (saved.rating >= 4.5) say("Magnifique.", "happy");
        else if (saved.rating <= 1.5) say("Oh non. The complaint desk is open.", "sad");
        else say("Logged.", "clap");
        return saved;
      } catch (e) {
        refresh(true);
        throw e;
      }
    },
    [patch, say, refresh],
  );

  const removeDiary = useCallback(
    async (id) => {
      const who = getSession().profile;
      patch((d) => ({ ...d, diary: { ...d.diary, [who]: removeById(d.diary[who], id) } }));
      try {
        await api.delDiary(id);
      } catch (e) {
        refresh(true);
        throw e;
      }
    },
    [patch, refresh],
  );

  /* ----- jazz shelf ----- */
  const saveJazz = useCallback(
    async (entry) => {
      const who = getSession().profile;
      const id = entry.id || newId();
      const full = { ...entry, id, createdAt: entry.createdAt || new Date().toISOString() };
      patch((d) => ({ ...d, jazz: { ...d.jazz, [who]: upsertById(d.jazz[who], full) } }));
      try {
        const { entry: saved } = await api.putJazz(id, full);
        patch((d) => ({ ...d, jazz: { ...d.jazz, [who]: upsertById(d.jazz[who], saved) } }));
        say("On the shelf.", "happy");
        return saved;
      } catch (e) {
        refresh(true);
        throw e;
      }
    },
    [patch, say, refresh],
  );

  const removeJazz = useCallback(
    async (id) => {
      const who = getSession().profile;
      patch((d) => ({ ...d, jazz: { ...d.jazz, [who]: removeById(d.jazz[who], id) } }));
      try {
        await api.delJazz(id);
      } catch (e) {
        refresh(true);
        throw e;
      }
    },
    [patch, refresh],
  );

  /* ----- watchlist ----- */
  const addToWatchlist = useCallback(
    async (film, note = "") => {
      const { item, already } = await api.addWatch({ ...film, note });
      patch((d) => ({ ...d, watchlist: upsertById(d.watchlist, item) }));
      if (already) say("That one is already in the queue.", "shrug");
      else say("Added to the queue.", "ticket");
      return item;
    },
    [patch, say],
  );

  const removeFromWatchlist = useCallback(
    async (id) => {
      patch((d) => ({ ...d, watchlist: removeById(d.watchlist, id) }));
      try {
        await api.delWatch(id);
      } catch (e) {
        refresh(true);
        throw e;
      }
    },
    [patch, refresh],
  );

  /* ----- movie nights ----- */
  const saveNight = useCallback(
    async (night, { quiet = false } = {}) => {
      const id = night.id || newId();
      const { night: saved } = await api.putNight(id, night);
      patch((d) => ({ ...d, nights: upsertById(d.nights, saved) }));
      if (!quiet) say("Movie night is on.", "ticket");
      return saved;
    },
    [patch, say],
  );

  const rsvp = useCallback(
    async (id, statusValue) => {
      const who = getSession().profile;
      patch((d) => ({
        ...d,
        nights: d.nights.map((n) => (n.id === id ? { ...n, rsvp: { ...n.rsvp, [who]: statusValue } } : n)),
      }));
      try {
        await api.rsvp(id, statusValue);
      } catch (e) {
        refresh(true);
        throw e;
      }
    },
    [patch, refresh],
  );

  const removeNight = useCallback(
    async (id) => {
      patch((d) => ({ ...d, nights: removeById(d.nights, id) }));
      try {
        await api.delNight(id);
      } catch (e) {
        refresh(true);
        throw e;
      }
    },
    [patch, refresh],
  );

  /* ----- dialogs any page can open ----- */
  const openModal = useCallback((type, props = {}) => setModal({ type, props }), []);
  const closeModal = useCallback(() => setModal(null), []);

  const value = useMemo(
    () => ({
      apiUrl, changeApi, session, me, signIn, signOut,
      data, status, error, refresh,
      saveDiary, removeDiary, saveJazz, removeJazz,
      addToWatchlist, removeFromWatchlist, saveNight, rsvp, removeNight,
      toast, say, modal, openModal, closeModal,
    }),
    [
      apiUrl, changeApi, session, me, signIn, signOut, data, status, error, refresh,
      saveDiary, removeDiary, saveJazz, removeJazz, addToWatchlist, removeFromWatchlist,
      saveNight, rsvp, removeNight, toast, say, modal, openModal, closeModal,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
