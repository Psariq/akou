import type { Lesson, SessionRecord, Task, TaskSkill } from "./types";

/**
 * Extra practice for weak areas. A task type is "weak" when the learner got
 * less than WEAK_BELOW right in their last RECENT answers of that type
 * (reading and listening together, at least MIN_ANSWERS answers). Each weak
 * type gets up to 2 extra questions in an exercise, MAX_EXTRAS in total.
 * Extras don't count toward the exercise score or the CEFR estimate.
 */
export const PRACTICE_SKILLS: TaskSkill[] = ["grammar", "vocabulary", "detail", "inference"];
export const WEAK_BELOW = 0.6;
export const RECENT = 10;
export const MIN_ANSWERS = 4;
export const PER_SKILL = 2;
export const MAX_EXTRAS = 3;

export interface Weakness {
  skill: TaskSkill;
  pct: number;
  n: number;
}

export function weakSkills(sessions: SessionRecord[]): Weakness[] {
  const out: Weakness[] = [];
  for (const skill of PRACTICE_SKILLS) {
    const recent = sessions
      .flatMap((s) => s.taskResults)
      .filter((r) => r.skill === skill)
      .slice(-RECENT);
    if (recent.length < MIN_ANSWERS) continue;
    const pct = recent.reduce((a, r) => a + r.score, 0) / recent.length;
    if (pct < WEAK_BELOW) out.push({ skill, pct, n: recent.length });
  }
  return out.sort((a, b) => a.pct - b.pct);
}

export interface PlanItem {
  skill: TaskSkill;
  count: number;
}

/** Weakest first: 2 each, at most MAX_EXTRAS in total. */
export function planExtras(weak: Weakness[]): PlanItem[] {
  const plan: PlanItem[] = [];
  let left = MAX_EXTRAS;
  for (const w of weak) {
    const count = Math.min(PER_SKILL, left);
    if (count <= 0) break;
    plan.push({ skill: w.skill, count });
    left -= count;
  }
  return plan;
}

export const planKey = (plan: PlanItem[]) => plan.map((p) => `${p.skill}${p.count}`).join("+");

/** Insert extra tasks before the writing task (which stays last). */
export function insertExtras(lesson: Lesson, extras: Task[]): Lesson {
  if (!extras.length || lesson.tasks.some((t) => t.extra)) return lesson;
  const w = lesson.tasks.findIndex((t) => t.type === "short_answer");
  const at = w < 0 ? lesson.tasks.length : w;
  return { ...lesson, tasks: [...lesson.tasks.slice(0, at), ...extras, ...lesson.tasks.slice(at)] };
}

/* ---------------- Store (per lesson, on this device) ---------------- */

const KEY = "akou.extras.v1";
const MAX_RECORDS = 60;

type Store = Record<string, { plan: string; tasks: Task[]; costUsd: number; createdAt: string }>;

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

export function getExtras(lessonId: string, plan: PlanItem[]): { tasks: Task[]; costUsd: number } | null {
  const r = load()[lessonId];
  return r && r.plan === planKey(plan) ? { tasks: r.tasks, costUsd: r.costUsd } : null;
}

export function saveExtras(lessonId: string, plan: PlanItem[], tasks: Task[], costUsd: number): void {
  const s = load();
  s[lessonId] = { plan: planKey(plan), tasks, costUsd, createdAt: new Date().toISOString() };
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
    /* cache only */
  }
}
