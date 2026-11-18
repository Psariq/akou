import type { Cefr, Lesson, Mode, Progress } from "./types";
import { LEVELS, describeTheta, expectedScore, levelToNum } from "./cefr";

/**
 * Monthly placement test (reading and listening, adaptive, 2 texts each).
 *
 * Stage 1 is at the learner's current level. Stage 2 goes one level up if
 * stage 1 was at least STEP_UP_AT right, otherwise one level down. The result
 * is the level that best explains both scores under the same model the app
 * uses for normal sessions (expectedScore). The learner then confirms
 * whether to apply it.
 */

export const STEP_UP_AT = 0.6;
/** Window: the last 7 days of a month, plus the first 7 days of the next month (if not done yet). */
export const WINDOW_DAYS_BEFORE_END = 7;
export const GRACE_DAYS_AFTER = 7;
/** Placement tests use levels A1–C1 (the range of the app's estimate). */
const PLACEMENT_LEVELS: Cefr[] = ["A1", "A2", "B1", "B2", "C1"];

export interface StageResult {
  level: Cefr;
  score: number;
  lessonId: string;
  title: string;
  sourceUrl?: string;
}

export interface PartResult {
  stages: StageResult[];
  theta: number;
  completedAt: string;
  /** Reading part: the longer writing task. */
  writing?: { level: Cefr; answer: string; feedback?: string; corrected?: string };
}

export interface Prepared {
  /** Level of stage 1 (decided when preparing). */
  start: Cefr;
  stage1?: Lesson;
  up?: Lesson;
  down?: Lesson;
}

export interface MonthState {
  month: string; // "2026-11"
  prepared: Partial<Record<Mode, Prepared>>;
  results: Partial<Record<Mode, PartResult>>;
  /** undefined = not decided yet; true = applied; false = kept current levels. */
  applied?: boolean;
  /** Hide the home banner until this ISO date. */
  snoozedUntil?: string;
  /** API cost of preparing and grading this test. */
  costUsd?: number;
}

/* ---------------- Timing ---------------- */

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * Which month's test is open right now (null if none): the current month in
 * its last 7 days, or the previous month during the first 7 days of a new one.
 */
export function openMonth(now: Date = new Date()): string | null {
  if (now.getDate() > daysInMonth(now) - WINDOW_DAYS_BEFORE_END) return monthKey(now);
  if (now.getDate() <= GRACE_DAYS_AFTER) return monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return null;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/* ---------------- Levels ---------------- */

/** Stage 1 level: the learner's current level (A1–C1). */
export function startLevel(theta: number): Cefr {
  return describeTheta(theta).level;
}

export function stage2Level(start: Cefr, stage1Score: number): Cefr {
  const i = PLACEMENT_LEVELS.indexOf(start);
  const j = stage1Score >= STEP_UP_AT ? Math.min(i + 1, PLACEMENT_LEVELS.length - 1) : Math.max(i - 1, 0);
  return PLACEMENT_LEVELS[j];
}

/**
 * The level (theta) that best explains the stage scores (least squares on the
 * app's expected-score model), limited to at most one level beyond the levels
 * actually tested.
 */
export function estimateTheta(stages: Pick<StageResult, "level" | "score">[]): number {
  const nums = stages.map((s) => levelToNum(s.level));
  const lo = Math.max(1, Math.min(...nums) - 1);
  const hi = Math.min(5.99, Math.max(...nums) + 0.99);
  let best = lo;
  let bestErr = Infinity;
  for (let t = lo; t <= hi + 1e-9; t += 0.01) {
    const err = stages.reduce((a, s) => a + (s.score - expectedScore(t, levelToNum(s.level))) ** 2, 0);
    if (err < bestErr - 1e-12) {
      bestErr = err;
      best = t;
    }
  }
  return Math.round(best * 100) / 100;
}

export const LEVEL_NAMES = LEVELS;

/* ---------------- Storage ---------------- */

const KEY = "akou.placement.v1";

type Store = Record<string, MonthState>;

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

function save(s: Store): void {
  // Keep prepared lessons only for the open/last month; results are kept for history.
  const keys = Object.keys(s).sort();
  for (const k of keys.slice(0, -1)) s[k].prepared = {};
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getMonth(month: string): MonthState {
  return load()[month] ?? { month, prepared: {}, results: {} };
}

export function updateMonth(month: string, fn: (m: MonthState) => MonthState): MonthState {
  const s = load();
  const next = fn(s[month] ?? { month, prepared: {}, results: {} });
  s[month] = next;
  save(s);
  return next;
}

export function allMonths(): MonthState[] {
  return Object.values(load()).sort((a, b) => a.month.localeCompare(b.month));
}

export function isComplete(m: MonthState): boolean {
  return !!m.results.reading && !!m.results.listening;
}

/** Text-bank URLs used in placement tests (so they aren't repeated in normal lessons). */
export function placementUsedUrls(): string[] {
  return allMonths().flatMap((m) =>
    [...Object.values(m.results).flatMap((r) => r?.stages.map((s) => s.sourceUrl) ?? []),
     ...Object.values(m.prepared).flatMap((p) => [p?.stage1, p?.up, p?.down].map((l) => l?.source.url))].filter(
      (x): x is string => !!x,
    ),
  );
}

/** Proposed new estimates after a completed test. */
export function proposal(m: MonthState, progress: Progress) {
  const out: { skill: "reading" | "listening" | "writing"; from?: number; to: number }[] = [];
  if (m.results.reading) out.push({ skill: "reading", from: progress.reading.theta, to: m.results.reading.theta });
  if (m.results.listening) out.push({ skill: "listening", from: progress.listening.theta, to: m.results.listening.theta });
  const w = m.results.reading?.writing;
  if (w) out.push({ skill: "writing", from: progress.writing?.n ? progress.writing.theta : undefined, to: levelToNum(w.level) + 0.5 });
  return out;
}
