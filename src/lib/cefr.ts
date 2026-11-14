import type { Cefr, SkillProgress } from "./types";

/**
 * CEFR level ESTIMATE.
 *
 * This is not a certification. Each session is generated at a target CEFR
 * level; the learner's score on it nudges a continuous estimate ("theta")
 * up or down, Elo-style. theta: 1 = A1, 2 = A2, 3 = B1, 4 = B2, 5 = C1,
 * and the fractional part is progress toward the next level.
 */

export const LEVELS: Cefr[] = ["A1", "A2", "B1", "B2", "C1"];
export const MIN_THETA = 1;
export const MAX_THETA = 5.99;

export function levelToNum(level: Cefr): number {
  return LEVELS.indexOf(level) + 1;
}

export function clampTheta(t: number): number {
  return Math.min(MAX_THETA, Math.max(MIN_THETA, t));
}

/**
 * Expected score (0..1) of a learner with estimate `theta` on material
 * pitched at `levelNum`. Someone who has just reached a level (theta == level)
 * is expected to score about 65%; one level above it about 89%; one level
 * below about 29%.
 */
export function expectedScore(theta: number, levelNum: number): number {
  return 1 / (1 + Math.exp(-(1.5 * (theta - levelNum) + 0.6)));
}

/** Step size shrinks as more sessions accumulate, so the estimate settles. */
export function stepSize(n: number): number {
  return Math.max(0.15, 0.45 / Math.sqrt(1 + n / 3));
}

export function updateProgress(p: SkillProgress, level: Cefr, score: number): SkillProgress {
  const s = Math.min(1, Math.max(0, score));
  const e = expectedScore(p.theta, levelToNum(level));
  return { theta: clampTheta(p.theta + stepSize(p.n) * (s - e)), n: p.n + 1 };
}

export interface LevelDescription {
  level: Cefr;
  next: Cefr | null;
  /** 0..1 progress toward the next level */
  progress: number;
}

export function describeTheta(theta: number): LevelDescription {
  const t = clampTheta(theta);
  const base = Math.floor(t);
  return {
    level: LEVELS[base - 1],
    next: base < LEVELS.length ? LEVELS[base] : null,
    progress: t - base,
  };
}

export type Band = "lower" | "middle" | "upper";

export interface Target {
  level: Cefr;
  band: Band;
}

/**
 * Level for the next text: slightly above the current estimate (i+1), never
 * below A2 (the app is designed for A2 and up).
 */
export function targetFor(theta: number, override: "auto" | Cefr = "auto"): Target {
  if (override !== "auto") return { level: override, band: "middle" };
  const t = Math.min(5.99, Math.max(2, clampTheta(theta) + 0.25));
  const base = Math.floor(t);
  const frac = t - base;
  return {
    level: LEVELS[base - 1],
    band: frac < 0.34 ? "lower" : frac < 0.67 ? "middle" : "upper",
  };
}

/** Confidence wording, based on how many sessions the estimate rests on. */
export function confidenceLabel(n: number): string {
  if (n === 0) return "starting point (self-assessed)";
  if (n < 5) return `rough (${n} session${n === 1 ? "" : "s"})`;
  if (n < 15) return `firming up (${n} sessions)`;
  return `fairly stable (${n} sessions)`;
}

export const START_LEVELS: { label: string; theta: number }[] = [
  { label: "A2 (beginning)", theta: 2.0 },
  { label: "A2", theta: 2.3 },
  { label: "A2/B1", theta: 2.85 },
  { label: "B1", theta: 3.3 },
  { label: "B1/B2", theta: 3.85 },
  { label: "B2", theta: 4.3 },
];

/**
 * Manually set the estimate (e.g. "the texts are far too hard"). History is
 * kept, but the estimate is treated as fresh so it adapts quickly again.
 */
export function setEstimate(p: SkillProgress, theta: number): SkillProgress {
  return { theta: clampTheta(theta), n: Math.min(p.n, 2) };
}

/**
 * Writing estimate: a running average of the CEFR levels the grader judged
 * the learner's written answers to show (each judged level counts as the
 * middle of that level, e.g. B1 = 3.5). The first answers count fully;
 * later ones with weight 1/(n+1), but never less than 0.2, so the estimate
 * keeps following recent progress.
 */
export function updateWriting(p: SkillProgress | undefined, judged: Cefr, evidence = 1): SkillProgress {
  // A longer answer is stronger evidence: it counts as `evidence` observations.
  const value = levelToNum(judged) + 0.5;
  let q = p;
  for (let i = 0; i < evidence; i++) {
    if (!q || q.n === 0) q = { theta: clampTheta(value), n: 1 };
    else {
      const w = Math.max(0.2, 1 / (q.n + 1));
      q = { theta: clampTheta(q.theta + w * (value - q.theta)), n: q.n + 1 };
    }
  }
  return q!;
}

/** Overall estimate: mean of the skills that have an estimate. */
export function overallTheta(p: { reading: SkillProgress; listening: SkillProgress; writing?: SkillProgress }): number {
  const parts = [p.reading.theta, p.listening.theta, ...(p.writing && p.writing.n > 0 ? [p.writing.theta] : [])];
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}
