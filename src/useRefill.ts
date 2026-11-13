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
import { describeError } from "./lib/claude";

export interface RefillStatus {
  running: boolean;
  mode: Mode | null;
  level: Cefr | null;
  error: string | null;
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
    if (!nextRefill(counts(), filling.current)) return;
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
          const { lesson, cost } = await createLesson(apiKey, s, mode, target, "mixed", { avoidTitles });
          addToStock(mode, { lesson, createdAt: new Date().toISOString(), costUsd: cost.usd });
          setVersion((v) => v + 1);
        }
        filling.current = null;
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
