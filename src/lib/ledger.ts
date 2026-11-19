import type { Mode, ModelId, UsageCost } from "./types";

/**
 * A log of every Claude API response and what it cost, by job, so the
 * Progress screen can show where the money goes. Unlike session costs, this
 * also counts work that is never used (lessons prepared but dropped, failed
 * attempts, translations made for lessons you never open).
 */

export type CostJob =
  | "lesson" // written on the spot while you wait
  | "lesson-bg" // prepared in the background for the library
  | "placement" // placement test texts
  | "news" // news search / article fetch
  | "glosses" // word translations for a whole text
  | "lookup" // single tapped word
  | "grading" // written answers
  | "extras"; // extra practice questions

export interface CostTag {
  job: CostJob;
  mode?: Mode;
}

export interface LedgerEntry {
  at: string;
  job: CostJob;
  mode?: Mode;
  model: ModelId;
  usd: number;
  inTok: number;
  outTok: number;
  searches?: number;
}

export const JOB_LABEL: Record<CostJob, string> = {
  "lesson-bg": "Lessons prepared in the background",
  lesson: "Lessons written while you wait",
  placement: "Placement test texts",
  news: "News search",
  glosses: "Word translations (whole texts)",
  lookup: "Single-word lookups",
  grading: "Grading written answers",
  extras: "Extra practice questions",
};

const KEY = "akou.ledger.v1";
const DROPPED_KEY = "akou.dropped.v1";
/** Keep about a year; a busy day has a few dozen entries. */
const MAX_ENTRIES = 8000;

export function loadLedger(): LedgerEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as LedgerEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordCost(tag: CostTag, model: ModelId, cost: UsageCost, now: Date = new Date()): void {
  try {
    const entry: LedgerEntry = {
      at: now.toISOString(),
      job: tag.job,
      ...(tag.mode ? { mode: tag.mode } : {}),
      model,
      usd: cost.usd,
      inTok: cost.inputTokens,
      outTok: cost.outputTokens,
      ...(cost.webSearches ? { searches: cost.webSearches } : {}),
    };
    localStorage.setItem(KEY, JSON.stringify([...loadLedger(), entry].slice(-MAX_ENTRIES)));
  } catch {
    /* storage full or blocked: tracking is best-effort */
  }
}

export interface JobRow {
  job: CostJob;
  calls: number;
  usd: number;
  inTok: number;
  outTok: number;
}

export interface CostSummary {
  rows: JobRow[];
  total: number;
  calls: number;
}

/** Spend per job for entries at or after `since`, most expensive first. */
export function summarize(entries: LedgerEntry[], since: Date): CostSummary {
  const t0 = since.getTime();
  const by = new Map<CostJob, JobRow>();
  for (const e of entries) {
    if (new Date(e.at).getTime() < t0) continue;
    const r = by.get(e.job) ?? { job: e.job, calls: 0, usd: 0, inTok: 0, outTok: 0 };
    r.calls++;
    r.usd += e.usd;
    r.inTok += e.inTok;
    r.outTok += e.outTok;
    by.set(e.job, r);
  }
  const rows = [...by.values()].sort((a, b) => b.usd - a.usd);
  return { rows, total: rows.reduce((a, r) => a + r.usd, 0), calls: rows.reduce((a, r) => a + r.calls, 0) };
}

export function trackingSince(entries: LedgerEntry[]): Date | null {
  return entries.length ? new Date(entries[0].at) : null;
}

export function startOfMonth(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/* ---------- Prepared lessons that were dropped without being used ---------- */

export interface DroppedEntry {
  at: string;
  usd: number;
}

export function loadDropped(): DroppedEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DROPPED_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as DroppedEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordDropped(usd: number, now: Date = new Date()): void {
  if (!(usd > 0)) return;
  try {
    localStorage.setItem(DROPPED_KEY, JSON.stringify([...loadDropped(), { at: now.toISOString(), usd }].slice(-2000)));
  } catch {
    /* ignore */
  }
}

export function droppedSince(entries: DroppedEntry[], since: Date): { n: number; usd: number } {
  const t0 = since.getTime();
  const xs = entries.filter((e) => new Date(e.at).getTime() >= t0);
  return { n: xs.length, usd: xs.reduce((a, e) => a + e.usd, 0) };
}
