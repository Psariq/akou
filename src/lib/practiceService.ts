import type { Lesson, Mode, Settings, Task } from "./types";
import { generateExtraTasks } from "./claude";
import { getExtras, planKey, saveExtras, type PlanItem } from "./practice";

/** Safety cap on extra-practice generations per 24 hours. */
export const MAX_EXTRA_PER_DAY = 20;
const LOG_KEY = "akou.extralog.v1";

function log(): number[] {
  try {
    return (JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as number[]).filter((t) => Date.now() - t < 86_400_000);
  } catch {
    return [];
  }
}

export function extraGenerationsLast24h(): number {
  return log().length;
}

const inFlight = new Map<string, Promise<{ tasks: Task[]; costUsd: number }>>();

/** Extra tasks for this lesson and plan; generated once and shared by concurrent callers. */
export function ensureExtras(
  apiKey: string,
  settings: Settings,
  lesson: Lesson,
  mode: Mode,
  plan: PlanItem[],
): Promise<{ tasks: Task[]; costUsd: number }> {
  if (!plan.length) return Promise.resolve({ tasks: [], costUsd: 0 });
  const have = getExtras(lesson.id, plan);
  if (have) return Promise.resolve(have);
  const key = `${lesson.id}|${planKey(plan)}`;
  const running = inFlight.get(key);
  if (running) return running;
  const l = log();
  if (l.length >= MAX_EXTRA_PER_DAY) return Promise.reject(new Error(`Daily limit of ${MAX_EXTRA_PER_DAY} extra-practice sets reached.`));
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify([...l, Date.now()]));
  } catch {
    /* ignore */
  }
  const p = generateExtraTasks(apiKey, settings, lesson, mode, plan)
    .then(({ tasks, cost }) => {
      saveExtras(lesson.id, plan, tasks, cost.usd);
      return { tasks, costUsd: cost.usd };
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
