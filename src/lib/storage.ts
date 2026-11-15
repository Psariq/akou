import type { Progress, SessionRecord, Settings } from "./types";
import type { EncryptedBlob } from "./crypto";
import { START_LEVELS } from "./cefr";
import { DEFAULT_LONG_WRITING_EVERY } from "./writing";

/**
 * Everything lives in this browser's localStorage, on this device only.
 * Every access is wrapped: storage can be unavailable (private mode, blocked
 * site data), and the app must still work for the current visit.
 */

const K = {
  settings: "akou.settings.v1",
  sessions: "akou.sessions.v1",
  progress: "akou.progress.v1",
  key: "akou.apikey.v1",
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const DEFAULT_NEWS_DOMAINS = [
  "ertnews.gr",
  "kathimerini.gr",
  "naftemporiki.gr",
  "tovima.gr",
  "efsyn.gr",
  "amna.gr",
];

export const DEFAULT_SETTINGS: Settings = {
  model: "claude-opus-5-5",
  explanationLang: "en",
  sources: { textbank: true, wikipedia: true, news: true, ai: true },
  newsDomains: DEFAULT_NEWS_DOMAINS,
  interests: "",
  startLevel: START_LEVELS.find((l) => l.label === "A2/B1")!.theta,
  levelOverride: "auto",
  speechRate: 0.9,
  longWritingEvery: DEFAULT_LONG_WRITING_EVERY,
  extraPractice: true,
  voiceURI: "",
};

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(K.settings);
  return {
    ...DEFAULT_SETTINGS,
    ...(s ?? {}),
    sources: { ...DEFAULT_SETTINGS.sources, ...(s?.sources ?? {}) },
  };
}

export function saveSettings(s: Settings): void {
  write(K.settings, s);
}

export function loadSessions(): SessionRecord[] {
  return read<SessionRecord[]>(K.sessions) ?? [];
}

export function addSession(rec: SessionRecord): SessionRecord[] {
  const all = [...loadSessions(), rec];
  write(K.sessions, all);
  return all;
}

export function initialProgress(startTheta: number): Progress {
  return { reading: { theta: startTheta, n: 0 }, listening: { theta: startTheta, n: 0 } };
}

export function loadProgress(startTheta: number): Progress {
  return read<Progress>(K.progress) ?? initialProgress(startTheta);
}

export function saveProgress(p: Progress): void {
  write(K.progress, p);
}

/* ---------- API key ---------- */

export type StoredKey = { kind: "plain"; key: string } | { kind: "encrypted"; blob: EncryptedBlob };

export function loadStoredKey(): StoredKey | null {
  return read<StoredKey>(K.key);
}

export function saveStoredKey(k: StoredKey): boolean {
  return write(K.key, k);
}

export function removeStoredKey(): void {
  remove(K.key);
}

/* ---------- Backup ---------- */

export interface Backup {
  app: "akou";
  version: 1;
  exportedAt: string;
  settings: Settings;
  progress: Progress;
  sessions: SessionRecord[];
}

/** The API key is deliberately NOT part of the backup. */
export function exportBackup(): Backup {
  const settings = loadSettings();
  return {
    app: "akou",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    progress: loadProgress(settings.startLevel),
    sessions: loadSessions(),
  };
}

export function importBackup(raw: unknown): { ok: true } | { ok: false; error: string } {
  const b = raw as Partial<Backup> | null;
  if (!b || b.app !== "akou" || b.version !== 1) return { ok: false, error: "Not an Άκου backup file." };
  if (!Array.isArray(b.sessions) || !b.progress || !b.settings) return { ok: false, error: "Backup is incomplete." };
  const ok =
    write(K.settings, { ...DEFAULT_SETTINGS, ...b.settings }) &&
    write(K.progress, b.progress) &&
    write(K.sessions, b.sessions);
  return ok ? { ok: true } : { ok: false, error: "Could not write to browser storage." };
}

export function resetProgress(): void {
  remove(K.sessions);
  remove(K.progress);
}
