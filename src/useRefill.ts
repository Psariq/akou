import { useCallback, useEffect, useRef, useState } from "react";
import type { Cefr, Mode, Progress, SessionRecord, Settings } from "./lib/types";
import { targetFor } from "./lib/cefr";
import {
  addToStock,
  availableLessons,
  countAtLevel,
  doneIds,
  generationsLast24h,
  loadStock,
  nextRefill,
  pruneStock,
  recordGeneration,
  saveStock,
} from "./lib/library";
import { createLesson } from "./lib/lessonFactory";
import { rankLessons } from "./lib/library";
import { getGlosses, hasGlosses } from "./lib/glosses";
import { ensureGlosses, glossGenerationsLast24h, MAX_GLOSS_PER_DAY } from "./lib/glossService";
import { getExtras, planExtras, weakSkills } from "./lib/practice";
import { getMonth, openMonth, placementUsedUrls } from "./lib/placement";
import { partPrepared, preparePart } from "./lib/placementService";
import { ensureExtras, extraGenerationsLast24h, MAX_EXTRA_PER_DAY } from "./lib/practiceService";
import { describeError } from "./lib/claude";
import { recordDropped } from "./lib/ledger";

export interface RefillStatus {
  running: boolean;
  mode: Mode | null;
  level: Cefr | null;
  error: string | null;
  /** True while word glosses are being prepared (rather than a lesson). */
  glossing?: boolean;
  /** True while placement test texts are being prepared. */
  placement?: boolean;
}

/** How many upcoming lessons per mode get their word glosses prepared in advance. */
const GLOSS_AHEAD = 2;

/** A placement part (open month, not yet done) whose texts aren't prepared yet. */
function placementToPrepare(): { month: string; mode: Mode } | null {
  const month = openMonth();
  if (!month) return null;
  const m = getMonth(month);
  for (const mode of ["reading", "listening"] as Mode[]) {
    if (!m.results[mode] && !partPrepared(month, mode)) return { month, mode };
  }
  return null;
}

/** Next upcoming lesson that lacks prepared extra practice (if any weak areas). */
function nextToPractice(settings: Settings, progress: Progress, sessions: SessionRecord[]) {
  if (settings.extraPractice === false) return null;
  const plan = planExtras(weakSkills(sessions));
  if (!plan.length) return null;
  const stock = loadStock();
  for (const mode of ["reading", "listening"] as Mode[]) {
    const target = targetFor(progress[mode].theta, settings.levelOverride);
    const next = rankLessons(availableLessons(mode, sessions, stock), target).slice(0, 1);
    const missing = next.find((c) => !getExtras(c.lesson.id, plan));
    if (missing) return { mode, lesson: missing.lesson, plan };
  }
  return null;
}

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
    const before = loadStock();
    const after = pruneStock(before, ss);
    // Lessons pruned without being done (expired news, over the cap) were paid for but never used.
    const done = doneIds(ss);
    const kept = new Set([...after.reading, ...after.listening].map((i) => i.lesson.id));
    for (const i of [...before.reading, ...before.listening]) {
      if (!kept.has(i.lesson.id) && !done.has(i.lesson.id)) recordDropped(i.costUsd + (getGlosses(i.lesson.id)?.costUsd ?? 0));
    }
    saveStock(after);
    return readyCounts(s, p, ss);
  }, []);

  useEffect(() => {
    if (!apiKey || running.current || Date.now() < retryAfter.current) return;
    const { settings: s0, progress: p0, sessions: ss0 } = latest.current;
    const needGloss = glossGenerationsLast24h() < MAX_GLOSS_PER_DAY && !!nextToGloss(s0, p0, ss0);
    const needPractice = extraGenerationsLast24h() < MAX_EXTRA_PER_DAY && !!nextToPractice(s0, p0, ss0);
    const needPlacement = !!placementToPrepare();
    if (!nextRefill(counts(), filling.current) && !needGloss && !needPractice && !needPlacement) return;
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
            ...placementUsedUrls(),
          ].filter((x): x is string => !!x);
          const { lesson, cost } = await createLesson(apiKey, s, mode, target, "mixed", { avoidTitles, usedUrls, job: "lesson-bg" });
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

        // And extra practice for weak areas, for the next lesson per mode.
        for (let i = 0; i < 2; i++) {
          if (extraGenerationsLast24h() >= MAX_EXTRA_PER_DAY) break;
          const { settings: s, progress: p, sessions: ss } = latest.current;
          const next = nextToPractice(s, p, ss);
          if (!next) break;
          setStatus({ running: true, mode: next.mode, level: next.lesson.level, error: null, glossing: true });
          await ensureExtras(apiKey, s, next.lesson, next.mode, next.plan);
        }

        // In the last week of the month: prepare the placement test texts.
        for (let i = 0; i < 2; i++) {
          const todo = placementToPrepare();
          if (!todo) break;
          const { settings: s, progress: p, sessions: ss } = latest.current;
          setStatus({ running: true, mode: todo.mode, level: null, error: null, glossing: false, placement: true });
          await preparePart(apiKey, s, todo.month, todo.mode, p[todo.mode].theta, ss);
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
