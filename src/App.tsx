import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Mode, Progress, SessionRecord, Settings, SourceKind } from "./lib/types";
import {
  loadProgress,
  loadSessions,
  loadSettings,
  loadStoredKey,
  removeStoredKey,
  saveProgress,
  saveSettings,
  saveStoredKey,
  addSession,
} from "./lib/storage";
import { decryptSecret, encryptSecret } from "./lib/crypto";
import { Home } from "./components/Home";
import { SessionView } from "./components/SessionView";
import { Stats } from "./components/Stats";
import { SettingsView } from "./components/SettingsView";
import { Guide } from "./components/Guide";
import { PlacementView } from "./components/PlacementView";
import { Unlock } from "./components/Unlock";
import { Icon } from "./components/Icon";
import { readyCounts, useRefill, type RefillStatus } from "./useRefill";

export type KeyState = "none" | "locked" | "ready";

export interface SessionRequest {
  mode: Mode;
  source: SourceKind | "mixed";
  url?: string;
  /** Unique per start, so "try another text" remounts the session. */
  nonce: number;
}

interface Ctx {
  settings: Settings;
  progress: Progress;
  sessions: SessionRecord[];
  apiKey: string | null;
  keyState: KeyState;
  keyEncrypted: boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  saveKey: (key: string, passphrase?: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  forgetKey: () => void;
  recordSession: (rec: SessionRecord, progress: Progress) => void;
  reload: () => void;
  startSession: (req: Omit<SessionRequest, "nonce">) => void;
  request: SessionRequest | null;
  navigate: (route: Route) => void;
  /** Ready lessons at the current target level, per mode. */
  ready: Record<Mode, number>;
  refill: RefillStatus;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppCtx missing");
  return c;
}

export type Route = "home" | "session" | "stats" | "settings" | "guide" | "placement";

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return (["session", "stats", "settings", "guide", "placement"] as Route[]).includes(h as Route) ? (h as Route) : "home";
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [progress, setProgress] = useState<Progress>(() => loadProgress(loadSettings().startLevel));
  const [sessions, setSessions] = useState<SessionRecord[]>(() => loadSessions());
  const [apiKey, setApiKey] = useState<string | null>(() => {
    const k = loadStoredKey();
    return k?.kind === "plain" ? k.key : null;
  });
  const [keyEncrypted, setKeyEncrypted] = useState(() => loadStoredKey()?.kind === "encrypted");
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [request, setRequest] = useState<SessionRequest | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((r: Route) => {
    const target = r === "home" ? "#/" : `#/${r}`;
    if (window.location.hash !== target) window.location.hash = target;
    else setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  const keyState: KeyState = apiKey ? "ready" : keyEncrypted ? "locked" : "none";
  const { status: refill, version: stockVersion } = useRefill(apiKey, settings, progress, sessions);
  const ready = useMemo(
    () => readyCounts(settings, progress, sessions),
    // stockVersion changes whenever a background lesson is added.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, progress, sessions, stockVersion],
  );

  const ctx = useMemo<Ctx>(
    () => ({
      settings,
      progress,
      sessions,
      apiKey,
      keyState,
      keyEncrypted,
      updateSettings: (patch) => {
        setSettings((prev) => {
          const next = { ...prev, ...patch };
          saveSettings(next);
          return next;
        });
      },
      saveKey: async (key, passphrase) => {
        if (passphrase) {
          const blob = await encryptSecret(key, passphrase);
          saveStoredKey({ kind: "encrypted", blob });
          setKeyEncrypted(true);
        } else {
          saveStoredKey({ kind: "plain", key });
          setKeyEncrypted(false);
        }
        setApiKey(key);
      },
      unlock: async (passphrase) => {
        const k = loadStoredKey();
        if (k?.kind !== "encrypted") return false;
        try {
          setApiKey(await decryptSecret(k.blob, passphrase));
          return true;
        } catch {
          return false;
        }
      },
      lock: () => {
        if (keyEncrypted) setApiKey(null);
      },
      forgetKey: () => {
        removeStoredKey();
        setKeyEncrypted(false);
        setApiKey(null);
      },
      recordSession: (rec, p) => {
        setSessions(addSession(rec));
        saveProgress(p);
        setProgress(p);
      },
      reload: () => {
        const s = loadSettings();
        setSettings(s);
        setProgress(loadProgress(s.startLevel));
        setSessions(loadSessions());
      },
      startSession: (req) => {
        setRequest({ ...req, nonce: Date.now() });
        navigate("session");
      },
      request,
      navigate,
      ready,
      refill,
    }),
    [settings, progress, sessions, apiKey, keyState, keyEncrypted, request, navigate, ready, refill],
  );

  const inSession = (route === "session" && request) || route === "placement";

  let page;
  if (keyState === "locked" && route !== "guide") page = <Unlock />;
  else if (route === "session") page = request ? <SessionView key={request.nonce} /> : <Home />;
  else if (route === "stats") page = <Stats />;
  else if (route === "settings") page = <SettingsView />;
  else if (route === "guide") page = <Guide />;
  else if (route === "placement") page = <PlacementView />;
  else page = <Home />;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        {page}
      </div>
      {!inSession && (
        <nav className="tabbar" aria-label="Main">
          <div className="tabbar-inner">
            <a href="#/" aria-current={route === "home" || route === "session" ? "page" : undefined}>
              <Icon name="book" />
              Practice
            </a>
            <a href="#/stats" aria-current={route === "stats" ? "page" : undefined}>
              <Icon name="chart" />
              Progress
            </a>
            <a href="#/settings" aria-current={route === "settings" || route === "guide" ? "page" : undefined}>
              <Icon name="gear" />
              Settings
            </a>
          </div>
        </nav>
      )}
    </AppCtx.Provider>
  );
}
