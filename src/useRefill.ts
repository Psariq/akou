import { useCallback, useEffect, useRef, useState } from "react";
import type { Cefr, Mode, Progress, SessionRecord, Settings } from "./lib/types";
import { targetFor } from "./lib/cefr";
import {
  addToStock,
  availableLessons,
  countAtLevel,
  generationsLast24h,
  loadStock,
  nextRefill,
  pruneStock,
  recordGeneration,
  saveStock,
} from "./lib/library";
import { createLesson } from "./lib/lessonFactory";
import { rankLessons } from "./lib/library";
import { hasGlosses } from "./lib/glosses";
import { ensureGlosses, glossGenerationsLast24h, MAX_GLOSS_PER_DAY } from "./lib/glossService";
import { describeError } from "./lib/claude";

export interface RefillStatus {
  running: boolean;
  mode: Mode | null;
  level: Cefr | null;
  error: string | null;
  /** True while word glosses are being prepared (rather than a lesson). */
  glossing?: boolean;
}

/** How many upcoming lessons per mode get their word glosses prepared in advance. */
const GLOSS_AHEAD = 2;

function nextToGloss(settings: Settings, progress: Progress, sessions: SessionRecord[]) {
  const stock = loadStock();
  for (const mode of ["reading", "listening"] as Mode[]) {
    const target = targetFor(progress[mode].theta, settings.levelOverride);
    const next = rankLessons(availableLessons(mode, sessions, stock), target).slice(0, GLOSS_AHEAD);
    const missing = next.find((c) => !hasGlosses(c.lesson.id));
    if (missing) return { mode, lesson: missing.lesson };
  }
  return null;
}

/** Ready lessons at the learner's current target level, per mode. */
export function readyCounts(settings: Settings, progress: Progress, sessions: SessionRecord[]): Record<Mode, number> {
  const stock = loadStock();
  const count = (mode: Mode) =>
    countAtLevel(availableLessons(mode, sessions, stock), targetFor(progress[mode].theta, settings.levelOverride).level);
  return { reading: count("reading"), listening: count("listening") };
}

const MAX_PER_RUN = 6;
const RETRY_AFTER_MS = 5 * 60_000;
/** Safety cap on background generation, so a bug can never run up costs. */
export const MAX_PER_DAY = 12;


/**
 * Keeps the on-device lesson stock topped up while the app is open.
 * One lesson is generated at a time. After a failure it waits 5 minutes
 * (or until something changes after that) before trying again.
 */
export function useRefill(
  apiKey: string | null,
  settings: Settings,
  progress: Progress,
  sessions: SessionRecord[],
): { status: RefillStatus; version: number } {
  const [status, setStatus] = useState<RefillStatus>({ running: false, mode: null, level: null, error: null });
  const [version, setVersion] = useState(0);
  const latest = useRef({ settings, progress, sessions });
  latest.current = { settings, progress, sessions };
  const running = useRef(false);
  const retryAfter = useRef(0);
  const filling = useRef<Mode | null>(null);

  const counts = useCallback(() => {
    const { settings: s, progress: p, sessions: ss } = latest.current;
    saveStock(pruneStock(loadStock(), ss));
    return readyCounts(s, p, ss);
  }, []);

  useEffect(() => {
    if (!apiKey || running.current || Date.now() < retryAfter.current) return;
    const { settings: s0, progress: p0, sessions: ss0 } = latest.current;
    const needGloss = glossGenerationsLast24h() < MAX_GLOSS_PER_DAY && !!nextToGloss(s0, p0, ss0);
    if (!nextRefill(counts(), filling.current) && !needGloss) return;
    running.current = true;

    (async () => {
      try {
        for (let i = 0; i < MAX_PER_RUN; i++) {
          const mode = nextRefill(counts(), filling.current);
          if (!mode) break;
          if (generationsLast24h() >= MAX_PER_DAY) {
            throw new Error(`Daily limit of ${MAX_PER_DAY} background lessons reached.`);
          }
          filling.current = mode;
          const { settings: s, progress: p, sessions: ss } = latest.current;
          const target = targetFor(p[mode].theta, s.levelOverride);
          setStatus({ running: true, mode, level: target.level, error: null });
          const avoidTitles = [
            ...ss.slice(-40).map((x) => x.source.title),
            ...loadStock()[mode].map((x) => x.lesson.source.title),
          ].filter((x): x is string => !!x);
          recordGeneration();
          const usedUrls = [
            ...ss.map((x) => x.source.url),
            ...loadStock()[mode].map((x) => x.lesson.source.url),
          ].filter((x): x is string => !!x);
          const { lesson, cost } = await createLesson(apiKey, s, mode, target, "mixed", { avoidTitles, usedUrls });
          addToStock(mode, { lesson, createdAt: new Date().toISOString(), costUsd: cost.usd });
          setVersion((v) => v + 1);
        }
        filling.current = null;

        // Then prepare word glosses for the lessons most likely to come next.
        for (let i = 0; i < 2 * GLOSS_AHEAD; i++) {
          if (glossGenerationsLast24h() >= MAX_GLOSS_PER_DAY) break;
          const { settings: s, progress: p, sessions: ss } = latest.current;
          const next = nextToGloss(s, p, ss);
          if (!next) break;
          setStatus({ running: true, mode: next.mode, level: next.lesson.level, error: null, glossing: true });
          await ensureGlosses(apiKey, s, next.lesson);
        }
        setStatus({ running: false, mode: null, level: null, error: null });
      } catch (e) {
        retryAfter.current = Date.now() + RETRY_AFTER_MS;
        setStatus({ running: false, mode: null, level: null, error: describeError(e) });
      } finally {
        running.current = false;
      }
    })();
  }, [apiKey, settings, progress, sessions, version, counts]);

  return { status, version };
}
