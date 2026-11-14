import { describe, expect, it } from "vitest";
import { countWords, lengthState, longTarget, longWritingDue, shortTarget, withLongWriting, writingTarget } from "./writing";
import { STARTER } from "./library";
import type { SessionRecord } from "./types";

const H = 60 * 60 * 1000;
const now = new Date("2026-11-14T18:00:00Z").getTime();
const at = (hoursAgo: number, longWriting = false) =>
  ({ date: new Date(now - hoursAgo * H).toISOString(), longWriting }) as SessionRecord;

describe("when to ask for a longer written answer", () => {
  it("every 4th exercise", () => {
    expect(longWritingDue([], 4, now)).toBe(false); // 1st
    expect(longWritingDue([at(72), at(48)], 4, now)).toBe(false); // 3rd
    expect(longWritingDue([at(72), at(48), at(24)], 4, now)).toBe(true); // 4th
    expect(longWritingDue([at(96), at(72, true), at(48), at(24)], 4, now)).toBe(false); // 3rd since the last long one
    expect(longWritingDue([at(120, true), at(96), at(72), at(48)], 4, now)).toBe(true);
  });

  it("never twice in one sitting (exercises < 2 h apart)", () => {
    // Long one 30 minutes ago in this sitting: not again, even if due by count.
    expect(longWritingDue([at(72), at(48), at(24), at(0.5, true)], 1, now)).toBe(false);
    // A chain of exercises each < 2 h apart is one sitting, even if it started 3 h ago.
    expect(longWritingDue([at(3, true), at(1.5), at(0.2)], 1, now)).toBe(false);
    // A long one 3 h ago with a break in between is a different sitting.
    expect(longWritingDue([at(3, true)], 1, now)).toBe(true);
  });

  it("can be turned off", () => {
    expect(longWritingDue([at(72), at(48), at(24)], 0, now)).toBe(false);
  });
});

describe("longer writing task", () => {
  it("extends only the writing task, with a level-appropriate length", () => {
    const lesson = STARTER.reading.find((l) => l.level === "B1")!;
    const long = withLongWriting(lesson);
    const w = long.tasks.find((t) => t.type === "short_answer")!;
    expect(w.long).toBe(true);
    expect(w.prompt).toContain("70–110 λέξεις");
    expect(w.prompt_en).toContain("70–110 words");
    expect(long.tasks.filter((t) => t.long)).toHaveLength(1);
    expect(lesson.tasks.some((t) => t.long)).toBe(false); // original untouched
    expect(longTarget("A2").sentences).toBe("4–6");
    expect(longTarget("B2").sentences).toBe("8–10");
  });
});

describe("word targets and counter", () => {
  it("has word ranges for short and long answers by level", () => {
    expect(shortTarget("A2").words).toEqual([15, 30]);
    expect(shortTarget("B1").words).toEqual([20, 40]);
    expect(longTarget("B1").words).toEqual([70, 110]);
    expect(writingTarget("B2", true).words).toEqual([110, 160]);
    expect(writingTarget("B2", false).words).toEqual([30, 50]);
  });

  it("counts words separated by whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  Ναι,  γιατί\nμου αρέσει. ")).toBe(4);
  });

  it("counts down to the minimum, then reports within / over", () => {
    const t = shortTarget("A2"); // 15–30
    expect(lengthState(0, t)).toEqual({ kind: "under", toGo: 15 });
    expect(lengthState(12, t)).toEqual({ kind: "under", toGo: 3 });
    expect(lengthState(15, t)).toEqual({ kind: "ok" });
    expect(lengthState(30, t)).toEqual({ kind: "ok" });
    expect(lengthState(34, t)).toEqual({ kind: "over", by: 4 });
  });
});

