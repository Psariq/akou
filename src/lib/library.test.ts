import { describe, expect, it } from "vitest";
import { STARTER, availableLessons, countAtLevel, nextRefill, pickLesson, pruneStock, type Stock, type StockItem } from "./library";
import { isUsableTask } from "./grading";
import { wordRange } from "./prompts";
import type { Lesson, Mode, SessionRecord } from "./types";

const words = (l: Lesson) => l.segments.map((s) => s.text).join(" ").split(/\s+/).filter(Boolean).length;
const emptyStock: Stock = { reading: [], listening: [] };
const done = (lessonId: string) => ({ lessonId }) as SessionRecord;

describe("starter library", () => {
  const all = [...STARTER.reading, ...STARTER.listening];

  it("has 4 reading + 4 listening lessons at each of A2, B1, B2", () => {
    for (const mode of ["reading", "listening"] as Mode[]) {
      for (const level of ["A2", "B1", "B2"] as const) {
        expect(STARTER[mode].filter((l) => l.level === level)).toHaveLength(4);
      }
    }
  });

  it("has unique ids", () => {
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
  });

  it.each(all.map((l) => [l.id, l] as const))("%s: 7 valid tasks, glossary, sensible length", (_id, l) => {
    expect(l.tasks).toHaveLength(7);
    for (const t of l.tasks) expect(isUsableTask(t), `${l.id} ${t.id}`).toBe(true);
    for (const t of l.tasks.filter((x) => x.type === "gap_fill")) expect(t.prompt.split("___")).toHaveLength(2);
    expect(l.tasks.map((t) => t.skill)).toEqual(["gist", "detail", "detail", "inference", "vocabulary", "grammar", "writing"]);
    expect(l.glossary.length).toBeGreaterThanOrEqual(6);
    const mode: Mode = l.id.includes("listening") ? "listening" : "reading";
    const [lo, hi] = wordRange(mode, l.level);
    const n = words(l);
    expect(n, `${l.id} has ${n} words`).toBeGreaterThanOrEqual(Math.floor(lo * 0.85));
    expect(n, `${l.id} has ${n} words`).toBeLessThanOrEqual(Math.ceil(hi * 1.15));
  });
});

describe("choosing a lesson", () => {
  it("takes a starter lesson at the target level, in order", () => {
    const c = pickLesson(availableLessons("reading", [], emptyStock), { level: "B1", band: "lower" });
    expect(c?.lesson.id).toBe("starter-reading-B1-1");
    expect(c?.origin).toBe("starter");
  });

  it("skips lessons already done", () => {
    const c = pickLesson(availableLessons("reading", [done("starter-reading-B1-1")], emptyStock), { level: "B1", band: "lower" });
    expect(c?.lesson.id).toBe("starter-reading-B1-2");
  });

  it("prefers generated lessons (news first) over starters at the same level", () => {
    const mk = (id: string, kind: "news" | "ai", createdAt: string): StockItem => ({
      lesson: { ...STARTER.reading[4], id, source: { kind } },
      createdAt,
      costUsd: 0.1,
    });
    const now = new Date("2026-11-13T12:00:00Z").getTime();
    const stock: Stock = { reading: [mk("g-ai", "ai", "2026-11-12T10:00:00Z"), mk("g-news", "news", "2026-11-12T11:00:00Z")], listening: [] };
    const c = pickLesson(availableLessons("reading", [], stock, now), { level: "B1", band: "lower" });
    expect(c?.lesson.id).toBe("g-news");
    expect(c?.costUsd).toBe(0.1);
  });

  it("drops news older than a few days", () => {
    const item: StockItem = { lesson: { ...STARTER.reading[4], id: "old-news", source: { kind: "news" } }, createdAt: "2026-11-01T00:00:00Z", costUsd: 0 };
    const now = new Date("2026-11-13T12:00:00Z").getTime();
    expect(availableLessons("reading", [], { reading: [item], listening: [] }, now).some((c) => c.lesson.id === "old-news")).toBe(false);
    expect(pruneStock({ reading: [item], listening: [] }, [], now).reading).toHaveLength(0);
  });

  it("falls back to the nearest level, preferring easier, but not more than one level away", () => {
    const onlyA2 = availableLessons("reading", STARTER.reading.filter((l) => l.level !== "A2").map((l) => done(l.id)), emptyStock);
    expect(pickLesson(onlyA2, { level: "B1", band: "middle" })?.lesson.level).toBe("A2");
    expect(pickLesson(onlyA2, { level: "B2", band: "middle" })).toBeNull();
  });

  it("with a specific source, ignores starters", () => {
    expect(pickLesson(availableLessons("reading", [], emptyStock), { level: "B1", band: "lower" }, "ai")).toBeNull();
  });
});

describe("refill rule (keep 3, refill below 2)", () => {
  it("does nothing while 2 or more are ready", () => {
    expect(nextRefill({ reading: 2, listening: 4 }, null)).toBeNull();
  });
  it("starts when a mode drops below 2, lowest first", () => {
    expect(nextRefill({ reading: 1, listening: 0 }, null)).toBe("listening");
  });
  it("keeps filling the same mode up to 3", () => {
    expect(nextRefill({ reading: 2, listening: 4 }, "reading")).toBe("reading");
    expect(nextRefill({ reading: 3, listening: 4 }, "reading")).toBeNull();
  });
  it("counts only lessons at the target level", () => {
    const c = availableLessons("listening", [], emptyStock);
    expect(countAtLevel(c, "B1")).toBe(4);
    expect(countAtLevel(c, "C1")).toBe(0);
  });
});
