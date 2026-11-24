import type { Cefr, Lesson, Mode, SessionRecord, SourceKind, Task } from "./types";
import { levelToNum, type Target } from "./cefr";
import readingA2 from "../data/starter/reading-A2.json";
import readingB1 from "../data/starter/reading-B1.json";
import readingB2 from "../data/starter/reading-B2.json";
import listeningA2 from "../data/starter/listening-A2.json";
import listeningB1 from "../data/starter/listening-B1.json";
import listeningB2 from "../data/starter/listening-B2.json";
import openWikipedia from "../data/open/wikipedia.json";
import { LIBRARY, type RawLesson } from "./libraryData";

/**
 * The lesson library: a built-in starter set plus lessons generated in the
 * background and stored on this device ("stock"). Sessions take a ready
 * lesson instantly; when fewer than REFILL_BELOW unused lessons are left at
 * the learner's level for a mode, new ones are generated until STOCK_TARGET.
 */

export const STOCK_TARGET = 3;
export const REFILL_BELOW = 2;
/** News lessons go stale; drop them from the stock after this many days. */
export const NEWS_MAX_AGE_DAYS = 4;
/** Hard cap per mode, so lessons at levels you've moved past don't pile up. */
export const STOCK_CAP = 8;

/* ---------------- Starter set ---------------- */

function normalize(raw: RawLesson, level: Cefr): Lesson {
  const source: Lesson["source"] = raw.source
    ? {
        kind: "wikipedia",
        starter: true,
        title: raw.source.title,
        url: raw.source.url,
        publisher: "Βικιπαίδεια",
        license: "CC BY-SA 4.0",
      }
    : { kind: "ai", starter: true, publisher: "Άκου starter library" };
  return {
    id: raw.id,
    title: raw.title,
    title_en: raw.title_en,
    topic: raw.topic,
    level,
    segments: raw.segments.map((s) =>
      typeof s === "string" ? { speaker: "", text: s } : { speaker: s[0], text: s[1] },
    ),
    glossary: raw.glossary.map(([greek, english, note]) => ({ greek, english, note: note ?? "" })),
    tasks: raw.tasks.map(
      (t, i): Task => ({
        id: `t${i + 1}`,
        type: t.type,
        skill: t.skill,
        prompt: t.prompt,
        prompt_en: t.en,
        options: t.type === "true_false" ? ["Σωστό", "Λάθος"] : t.options ?? [],
        correct_index: t.answer ?? -1,
        accepted_answers: t.accept ?? [],
        pairs: (t.pairs ?? []).map(([greek, english]) => ({ greek, english })),
        explanation: t.explain ?? "",
      }),
    ),
    source,
  };
}

const load = (raws: unknown, level: Cefr) => (raws as RawLesson[]).map((r) => normalize(r, level));

/** Lessons adapted from open-licensed Greek Wikipedia articles (CC BY-SA 4.0). */
const OPEN: RawLesson[] = (openWikipedia as { lessons: RawLesson[] }).lessons;
const openFor = (mode: Mode) => OPEN.filter((l) => l.mode === mode).map((l) => normalize(l, l.level!));

/** The larger built-in library: word translations included, so using a lesson costs nothing. */
const libraryFor = (mode: Mode): Lesson[] =>
  LIBRARY.filter((l) => l.mode === mode).map((l) => {
    const lesson = normalize(l, l.level);
    return { ...lesson, source: { kind: "ai", starter: true, library: true, publisher: "Άκου library" } };
  });

/**
 * Built-in lessons, in the order they are used: Wikipedia-based ones first,
 * then the library (translations included), then the first AI-written
 * starters (their translations still come from the API).
 */
export const STARTER: Record<Mode, Lesson[]> = {
  reading: [
    ...openFor("reading"),
    ...libraryFor("reading"),
    ...load(readingA2, "A2"),
    ...load(readingB1, "B1"),
    ...load(readingB2, "B2"),
  ],
  listening: [
    ...openFor("listening"),
    ...libraryFor("listening"),
    ...load(listeningA2, "A2"),
    ...load(listeningB1, "B1"),
    ...load(listeningB2, "B2"),
  ],
};

/* ---------------- Stock (generated, on this device) ---------------- */

export interface StockItem {
  lesson: Lesson;
  createdAt: string;
  /** What generating it cost; added to the session that uses it. */
  costUsd: number;
}

export type Stock = Record<Mode, StockItem[]>;

const STOCK_KEY = "akou.stock.v1";

export function loadStock(): Stock {
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Stock>) : {};
    return { reading: s.reading ?? [], listening: s.listening ?? [] };
  } catch {
    return { reading: [], listening: [] };
  }
}

export function saveStock(s: Stock): void {
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify(s));
  } catch {
    /* storage full or unavailable: the stock is a cache, so carry on */
  }
}

export function doneIds(sessions: SessionRecord[]): Set<string> {
  return new Set(sessions.map((s) => s.lessonId).filter((x): x is string => !!x));
}

function isExpired(item: StockItem, now: number): boolean {
  if (item.lesson.source.kind !== "news") return false;
  return now - new Date(item.createdAt).getTime() > NEWS_MAX_AGE_DAYS * 86_400_000;
}

/** Drop used and stale lessons; cap each mode (oldest go first). */
export function pruneStock(stock: Stock, sessions: SessionRecord[], now: number = Date.now()): Stock {
  const done = doneIds(sessions);
  const clean = (items: StockItem[]) =>
    items.filter((i) => !done.has(i.lesson.id) && !isExpired(i, now)).slice(-STOCK_CAP);
  return { reading: clean(stock.reading), listening: clean(stock.listening) };
}

export function addToStock(mode: Mode, item: StockItem): Stock {
  const s = loadStock();
  s[mode] = [...s[mode], item].slice(-STOCK_CAP);
  saveStock(s);
  return s;
}

/** Timestamps of background generations (kept separately: used lessons leave the stock). */
const GENLOG_KEY = "akou.genlog.v1";

export function recordGeneration(now: number = Date.now()): void {
  try {
    const log = (JSON.parse(localStorage.getItem(GENLOG_KEY) ?? "[]") as number[]).filter((t) => now - t < 86_400_000);
    localStorage.setItem(GENLOG_KEY, JSON.stringify([...log, now]));
  } catch {
    /* ignore */
  }
}

export function generationsLast24h(now: number = Date.now()): number {
  try {
    return (JSON.parse(localStorage.getItem(GENLOG_KEY) ?? "[]") as number[]).filter((t) => now - t < 86_400_000).length;
  } catch {
    return 0;
  }
}

/* ---------------- Choosing a lesson ---------------- */

export interface Candidate {
  lesson: Lesson;
  origin: "stock" | "starter";
  createdAt?: string;
  costUsd: number;
  /** A graded text kept back until it is due (1 lesson in GRADED_EVERY). */
  held?: boolean;
}

/* ---------------- Graded texts: 1 lesson in 4 ---------------- */

/**
 * While built-in lessons are available, one lesson in GRADED_EVERY per mode
 * is a graded text from the Centre for the Greek Language (written with the
 * API); the rest come from the built-in library.
 */
export const GRADED_EVERY = 4;

/** Sessions of this mode since the last one on a graded text (all of them if none). */
export function sessionsSinceGraded(mode: Mode, sessions: SessionRecord[]): number {
  let n = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.mode !== mode) continue;
    if (s.source.kind === "textbank") break;
    n++;
  }
  return n;
}

/** The next session of this mode should be on a graded text. */
export function gradedDue(mode: Mode, sessions: SessionRecord[]): boolean {
  return sessionsSinceGraded(mode, sessions) >= GRADED_EVERY - 1;
}

/** Prepare the graded text one session early, so it is ready when it is due. */
export function gradedPrepareNow(mode: Mode, sessions: SessionRecord[]): boolean {
  return sessionsSinceGraded(mode, sessions) >= GRADED_EVERY - 2;
}

/* ---------------- Built-in lessons left (restock reminder) ---------------- */

/** Below this many unused built-in lessons at the learner's level (per mode), the app suggests restocking. */
export const LOW_LIBRARY = 10;

/** Unused built-in lessons (library and starters) of a mode at one level. */
export function builtInLeft(mode: Mode, level: Cefr, sessions: SessionRecord[]): number {
  const done = doneIds(sessions);
  return STARTER[mode].filter((l) => l.level === level && !done.has(l.id)).length;
}

export function availableLessons(mode: Mode, sessions: SessionRecord[], stock: Stock, now: number = Date.now()): Candidate[] {
  const done = doneIds(sessions);
  const hold = !gradedDue(mode, sessions);
  const fromStock: Candidate[] = stock[mode]
    .filter((i) => !done.has(i.lesson.id) && !isExpired(i, now))
    .map((i) => ({
      lesson: i.lesson,
      origin: "stock",
      createdAt: i.createdAt,
      costUsd: i.costUsd,
      ...(hold && i.lesson.source.kind === "textbank" ? { held: true } : {}),
    }));
  const fromStarter: Candidate[] = STARTER[mode]
    .filter((l) => !done.has(l.id))
    .map((l) => ({ lesson: l, origin: "starter", costUsd: 0 }));
  return [...fromStock, ...fromStarter];
}

export function countAtLevel(cands: Candidate[], level: Cefr): number {
  return cands.filter((c) => c.lesson.level === level).length;
}

/**
 * Order within a level: fresh news first (it expires), then other generated
 * lessons (oldest first), then built-in ones; a graded text that isn't due
 * yet comes last.
 */
function rank(c: Candidate): number {
  if (c.held) return 3;
  if (c.origin === "stock" && c.lesson.source.kind === "news") return 0;
  if (c.origin === "stock") return 1;
  return 2;
}

export function pickLesson(cands: Candidate[], target: Target, source: SourceKind | "mixed" = "mixed"): Candidate | null {
  return rankLessons(cands, target, source)[0] ?? null;
}

/** All usable lessons in the order they would be picked (at most one level from the target). */
export function rankLessons(cands: Candidate[], target: Target, source: SourceKind | "mixed" = "mixed"): Candidate[] {
  const pool = source === "mixed" ? cands : cands.filter((c) => c.lesson.source.kind === source);
  if (!pool.length) return [];
  const t = levelToNum(target.level);
  const sorted = pool
    .map((c, i) => ({ c, i, dist: Math.abs(levelToNum(c.lesson.level) - t) }))
    .sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      // Same distance from the target: prefer the easier level.
      const la = levelToNum(a.c.lesson.level);
      const lb = levelToNum(b.c.lesson.level);
      if (la !== lb) return la - lb;
      if (rank(a.c) !== rank(b.c)) return rank(a.c) - rank(b.c);
      if (a.c.origin === "stock" && a.c.lesson.source.kind === "news") {
        return (b.c.createdAt ?? "").localeCompare(a.c.createdAt ?? ""); // newest news first
      }
      return a.i - b.i; // stock: oldest first; starters: file order
    });
  // A lesson more than one level away from the target is too far off; generate instead.
  return sorted.filter((x) => x.dist <= 1).map((x) => x.c);
}

/**
 * Which mode (if any) needs a new lesson. A mode starts refilling when it has
 * fewer than REFILL_BELOW lessons at the target level, and keeps going until
 * STOCK_TARGET (`filling` carries that state between calls).
 */
export function nextRefill(
  counts: Record<Mode, number>,
  filling: Mode | null,
): Mode | null {
  if (filling && counts[filling] < STOCK_TARGET) return filling;
  const modes: Mode[] = ["reading", "listening"];
  const low = modes.filter((m) => counts[m] < REFILL_BELOW).sort((a, b) => counts[a] - counts[b]);
  return low[0] ?? null;
}
