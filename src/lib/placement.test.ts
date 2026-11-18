import { describe, expect, it } from "vitest";
import { estimateTheta, openMonth, proposal, stage2Level, startLevel, type MonthState } from "./placement";
import { describeTheta } from "./cefr";

describe("when the placement test is open", () => {
  it("in the last 7 days of a month", () => {
    expect(openMonth(new Date(2026, 10, 23))).toBeNull(); // 23 Nov (30 days)
    expect(openMonth(new Date(2026, 10, 24))).toBe("2026-11");
    expect(openMonth(new Date(2026, 10, 30))).toBe("2026-11");
    expect(openMonth(new Date(2027, 1, 22))).toBe("2027-02"); // February (28 days)
  });
  it("and for the previous month during the first 7 days", () => {
    expect(openMonth(new Date(2026, 11, 1))).toBe("2026-11");
    expect(openMonth(new Date(2026, 11, 7))).toBe("2026-11");
    expect(openMonth(new Date(2027, 0, 3))).toBe("2026-12");
    expect(openMonth(new Date(2026, 11, 8))).toBeNull();
  });
});

describe("adaptive levels", () => {
  it("starts at the current level", () => {
    expect(startLevel(2.0)).toBe("A2");
    expect(startLevel(3.4)).toBe("B1");
  });
  it("goes up after ≥60% and down otherwise, within A1–C1", () => {
    expect(stage2Level("A2", 0.6)).toBe("B1");
    expect(stage2Level("A2", 0.59)).toBe("A1");
    expect(stage2Level("C1", 0.9)).toBe("C1");
    expect(stage2Level("A1", 0.1)).toBe("A1");
  });
});

describe("placement estimate", () => {
  const lvl = (t: number) => describeTheta(t);
  it("~65% at a level means 'just reached that level'", () => {
    expect(estimateTheta([{ level: "B1", score: 0.65 }])).toBeCloseTo(3.0, 1);
  });
  it("strong at A2 and fair at B1 → late A2 / early B1", () => {
    const t = estimateTheta([
      { level: "A2", score: 0.9 },
      { level: "B1", score: 0.6 },
    ]);
    expect(t).toBeGreaterThan(2.7);
    expect(t).toBeLessThan(3.2);
  });
  it("weak at A2 and fair at A1 → A1", () => {
    expect(lvl(estimateTheta([{ level: "A2", score: 0.3 }, { level: "A1", score: 0.6 }])).level).toBe("A1");
  });
  it("never claims more than one level beyond what was tested", () => {
    const t = estimateTheta([
      { level: "A2", score: 1 },
      { level: "B1", score: 1 },
    ]);
    expect(t).toBeLessThan(4);
    expect(lvl(t).level).toBe("B1");
  });
  it("more right means a higher estimate", () => {
    const a = estimateTheta([{ level: "B1", score: 0.5 }, { level: "A2", score: 0.8 }]);
    const b = estimateTheta([{ level: "B1", score: 0.5 }, { level: "A2", score: 0.95 }]);
    expect(b).toBeGreaterThan(a);
  });
});

describe("proposal", () => {
  it("lists reading, listening and (if written) writing", () => {
    const m: MonthState = {
      month: "2026-11",
      prepared: {},
      results: {
        reading: { stages: [], theta: 2.8, completedAt: "", writing: { level: "B1", answer: "x" } },
        listening: { stages: [], theta: 2.4, completedAt: "" },
      },
    };
    const p = proposal(m, { reading: { theta: 2, n: 5 }, listening: { theta: 2, n: 5 } });
    expect(p).toEqual([
      { skill: "reading", from: 2, to: 2.8 },
      { skill: "listening", from: 2, to: 2.4 },
      { skill: "writing", from: undefined, to: 3.5 },
    ]);
  });
});
