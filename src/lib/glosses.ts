import type { GlossEntry, Lesson } from "./types";
import { normalize, normalizeLoose } from "./grading";
import { bundledGlosses } from "./libraryData";

/**
 * Word glosses ("tap a word to see its translation").
 *
 * For every lesson, Claude produces one entry per distinct word form in the
 * text, translated in context. They are stored on this device, keyed by
 * lesson id, for built-in and generated lessons alike. Words that are
 * missing get looked up on demand and added to the same record.
 */

export interface GlossRecord {
  entries: GlossEntry[];
  /** What generating them cost; added to the session that first uses the lesson. */
  costUsd: number;
  createdAt: string;
  /** True once the whole lesson has been glossed (not just single looked-up words). */
  complete?: boolean;
}

const KEY = "akou.glosses.v1";
/** Keep the store small: generated lessons come and go. */
const MAX_RECORDS = 80;

type Store = Record<string, GlossRecord>;

function loadStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

function saveStore(s: Store): void {
  const ids = Object.keys(s);
  if (ids.length > MAX_RECORDS) {
    ids
      .sort((a, b) => s[a].createdAt.localeCompare(s[b].createdAt))
      .slice(0, ids.length - MAX_RECORDS)
      .forEach((id) => delete s[id]);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full: glosses are a cache */
  }
}

export function getGlosses(lessonId: string): GlossRecord | null {
  const stored = loadStore()[lessonId] ?? null;
  const bundled = bundledGlosses(lessonId);
  if (!bundled) return stored;
  // Built-in library lesson: translations ship with the app (free); add any words looked up on demand.
  return {
    entries: dedupe([...bundled, ...(stored?.entries ?? [])]),
    costUsd: stored?.costUsd ?? 0,
    createdAt: stored?.createdAt ?? "",
    complete: true,
  };
}

export function hasGlosses(lessonId: string): boolean {
  return !!bundledGlosses(lessonId) || !!loadStore()[lessonId]?.complete;
}

/** Components showing a lesson listen for this to pick up new glosses. */
export const GLOSS_EVENT = "akou-glosses";

function changed(lessonId: string): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GLOSS_EVENT, { detail: lessonId }));
}

export function saveGlosses(lessonId: string, entries: GlossEntry[], costUsd: number): void {
  const s = loadStore();
  s[lessonId] = { entries: dedupe(entries), costUsd, createdAt: new Date().toISOString(), complete: true };
  saveStore(s);
  changed(lessonId);
}

/** Add one looked-up word to a lesson's record (creating it if needed). */
export function addGloss(lessonId: string, entry: GlossEntry): void {
  const s = loadStore();
  const rec = s[lessonId] ?? { entries: [], costUsd: 0, createdAt: new Date().toISOString() };
  rec.entries = dedupe([...rec.entries, entry]);
  s[lessonId] = rec;
  saveStore(s);
  changed(lessonId);
}

function dedupe(entries: GlossEntry[]): GlossEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const k = normalize(e.form);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Exact match (ignoring case/punctuation) first, then ignoring accents (e.g. capitalised words). */
export function findGloss(entries: GlossEntry[], word: string): GlossEntry | null {
  const w = normalize(word);
  const exact = entries.find((e) => normalize(e.form) === w);
  if (exact) return exact;
  const loose = normalizeLoose(word);
  return entries.find((e) => normalizeLoose(e.form) === loose) ?? null;
}

/* ---------------- Text → tappable tokens ---------------- */

export interface Token {
  text: string;
  word: boolean;
}

const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;

/** Split text into word and non-word tokens, keeping everything (joining them gives the text back). */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), word: false });
    out.push({ text: m[0], word: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), word: false });
  return out;
}

/** The sentence around a character position, as context for an on-demand lookup. */
export function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf(".", index - 1), text.lastIndexOf(";", index - 1), text.lastIndexOf("!", index - 1)) + 1;
  const ends = [".", ";", "!", "?"].map((p) => text.indexOf(p, index)).filter((x) => x >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end).trim();
}

/** Distinct word forms of a lesson (lowercased), e.g. to check coverage. */
export function distinctWords(lesson: Pick<Lesson, "segments">): string[] {
  const set = new Set<string>();
  for (const s of lesson.segments) for (const t of tokenize(s.text)) if (t.word) set.add(normalize(t.text));
  return [...set];
}

/* ---------------- Words you looked up ---------------- */

export interface LookedUp extends GlossEntry {
  lessonId: string;
  date: string;
}

const LOOKUPS_KEY = "akou.lookups.v1";
const MAX_LOOKUPS = 500;

export function loadLookups(): LookedUp[] {
  try {
    return JSON.parse(localStorage.getItem(LOOKUPS_KEY) ?? "[]") as LookedUp[];
  } catch {
    return [];
  }
}

export function recordLookup(lessonId: string, g: GlossEntry): void {
  const list = loadLookups().filter((x) => normalize(x.lemma) !== normalize(g.lemma));
  list.push({ ...g, lessonId, date: new Date().toISOString() });
  try {
    localStorage.setItem(LOOKUPS_KEY, JSON.stringify(list.slice(-MAX_LOOKUPS)));
  } catch {
    /* ignore */
  }
}
