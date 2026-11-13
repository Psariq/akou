import type { Lesson, Settings } from "./types";
import { generateGlosses } from "./claude";
import { getGlosses, saveGlosses, type GlossRecord } from "./glosses";

/** Safety cap on gloss generation per 24 hours (each lesson needs it once). */
export const MAX_GLOSS_PER_DAY = 20;
const LOG_KEY = "akou.glosslog.v1";

function log(): number[] {
  try {
    return (JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as number[]).filter((t) => Date.now() - t < 86_400_000);
  } catch {
    return [];
  }
}

export function glossGenerationsLast24h(): number {
  return log().length;
}

function record(): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify([...log(), Date.now()]));
  } catch {
    /* ignore */
  }
}

const inFlight = new Map<string, Promise<GlossRecord>>();

/**
 * Make sure a lesson has glosses. Concurrent calls for the same lesson share
 * one request (e.g. the open session and the background filler).
 */
export function ensureGlosses(apiKey: string, settings: Settings, lesson: Lesson): Promise<GlossRecord> {
  const existing = getGlosses(lesson.id);
  if (existing?.complete) return Promise.resolve(existing);
  const running = inFlight.get(lesson.id);
  if (running) return running;
  if (glossGenerationsLast24h() >= MAX_GLOSS_PER_DAY) {
    return Promise.reject(new Error(`Daily limit of ${MAX_GLOSS_PER_DAY} gloss generations reached.`));
  }
  record();
  const p = generateGlosses(apiKey, settings, lesson)
    .then(({ entries, cost }) => {
      // Keep any words looked up on demand in the meantime.
      saveGlosses(lesson.id, [...entries, ...(getGlosses(lesson.id)?.entries ?? [])], cost.usd);
      return getGlosses(lesson.id)!;
    })
    .finally(() => inFlight.delete(lesson.id));
  inFlight.set(lesson.id, p);
  return p;
}
