import Anthropic from "@anthropic-ai/sdk";
import type { Cefr, Lesson, Mode, Settings } from "./types";
import { createLesson } from "./lessonFactory";
import { getMonth, placementUsedUrls, stage2Level, startLevel, updateMonth, type Prepared } from "./placement";
import { loadStock } from "./library";
import type { SessionRecord } from "./types";

type Slot = "stage1" | "up" | "down";

const inFlight = new Map<string, Promise<Lesson>>();

function usedUrls(sessions: SessionRecord[]): string[] {
  const stock = loadStock();
  return [
    ...sessions.map((s) => s.source.url),
    ...[...stock.reading, ...stock.listening].map((i) => i.lesson.source.url),
    ...placementUsedUrls(),
  ].filter((x): x is string => !!x);
}

/**
 * One placement text at an exact level: a graded text from the Centre for
 * the Greek Language's text bank if possible, otherwise another source.
 */
async function makeLesson(
  apiKey: string,
  settings: Settings,
  mode: Mode,
  level: Cefr,
  sessions: SessionRecord[],
  onStep?: (s: string) => void,
): Promise<{ lesson: Lesson; usd: number }> {
  const target = { level, band: "middle" as const };
  const opts = { usedUrls: usedUrls(sessions), onStep, job: "placement" as const };
  try {
    const r = await createLesson(apiKey, settings, mode, target, "textbank", opts);
    return { lesson: r.lesson, usd: r.cost.usd };
  } catch (e) {
    // A bad key, spend limit etc. won't be fixed by another source.
    if (e instanceof Anthropic.APIError) throw e;
    const r = await createLesson(apiKey, settings, mode, target, "mixed", opts);
    return { lesson: r.lesson, usd: r.cost.usd };
  }
}

/** Get (or make and store) the lesson for one slot of a month's test. */
export function ensureSlot(
  apiKey: string,
  settings: Settings,
  month: string,
  mode: Mode,
  slot: Slot,
  theta: number,
  sessions: SessionRecord[],
  onStep?: (s: string) => void,
): Promise<Lesson> {
  const m = getMonth(month);
  const p: Prepared = m.prepared[mode] ?? { start: startLevel(theta) };
  const have = p[slot];
  if (have) return Promise.resolve(have);
  const key = `${month}|${mode}|${slot}`;
  const running = inFlight.get(key);
  if (running) return running;
  const level = slot === "stage1" ? p.start : stage2Level(p.start, slot === "up" ? 1 : 0);
  const job = makeLesson(apiKey, settings, mode, level, sessions, onStep)
    .then(({ lesson, usd }) => {
      updateMonth(month, (cur) => {
        const prep: Prepared = cur.prepared[mode] ?? { start: p.start };
        return {
          ...cur,
          costUsd: (cur.costUsd ?? 0) + usd,
          prepared: { ...cur.prepared, [mode]: { ...prep, [slot]: lesson } },
        };
      });
      return lesson;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

/** Prepare everything for one skill in the background (stage 1 first, then both stage-2 options). */
export async function preparePart(
  apiKey: string,
  settings: Settings,
  month: string,
  mode: Mode,
  theta: number,
  sessions: SessionRecord[],
): Promise<void> {
  for (const slot of ["stage1", "up", "down"] as Slot[]) {
    await ensureSlot(apiKey, settings, month, mode, slot, theta, sessions);
  }
}

export function partPrepared(month: string, mode: Mode): boolean {
  const p = getMonth(month).prepared[mode];
  return !!(p?.stage1 && p.up && p.down);
}
