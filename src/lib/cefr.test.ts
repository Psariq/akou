import { describe, expect, it } from "vitest";
import { describeTheta, expectedScore, overallTheta, setEstimate, targetFor, updateProgress, updateWriting } from "./cefr";

describe("cefr estimate", () => {
  it("expects ~65% at the learner's own level", () => {
    expect(expectedScore(3, 3)).toBeCloseTo(0.646, 2);
    expect(expectedScore(4, 3)).toBeGreaterThan(0.85);
    expect(expectedScore(2, 3)).toBeLessThan(0.35);
  });

  it("moves up after a strong score and down after a weak one", () => {
    const p = { theta: 2.85, n: 0 };
    expect(updateProgress(p, "B1", 0.9).theta).toBeGreaterThan(2.85);
    expect(updateProgress(p, "B1", 0.3).theta).toBeLessThan(2.85);
    expect(updateProgress(p, "B1", 0.9).n).toBe(1);
  });

  it("takes smaller steps as sessions accumulate", () => {
    const early = updateProgress({ theta: 3, n: 0 }, "B1", 1).theta - 3;
    const late = updateProgress({ theta: 3, n: 40 }, "B1", 1).theta - 3;
    expect(late).toBeLessThan(early);
    expect(late).toBeGreaterThan(0);
  });

  it("converges near the level where the learner scores ~65%", () => {
    // A learner who always scores 65% on B1 texts should settle around B1 (theta ~3).
    let p = { theta: 2.3, n: 0 };
    for (let i = 0; i < 60; i++) p = updateProgress(p, "B1", 0.65);
    expect(p.theta).toBeGreaterThan(2.85);
    expect(p.theta).toBeLessThan(3.15);
  });

  it("stays within bounds", () => {
    let p = { theta: 5.9, n: 0 };
    for (let i = 0; i < 20; i++) p = updateProgress(p, "A2", 1);
    expect(p.theta).toBeLessThanOrEqual(5.99);
  });

  it("describes levels and progress", () => {
    expect(describeTheta(3.25)).toEqual({ level: "B1", next: "B2", progress: 0.25 });
    expect(describeTheta(2).level).toBe("A2");
  });

  it("targets slightly above the estimate, never below A2", () => {
    expect(targetFor(2.85).level).toBe("B1");
    expect(targetFor(2.85).band).toBe("lower");
    expect(targetFor(1.2).level).toBe("A2");
    expect(targetFor(2.85, "B2")).toEqual({ level: "B2", band: "middle" });
  });

  it("setting the level by hand moves the estimate and lets it adapt quickly", () => {
    const p = setEstimate({ theta: 3.1, n: 12 }, 2.0);
    expect(p).toEqual({ theta: 2.0, n: 2 });
    expect(targetFor(p.theta)).toEqual({ level: "A2", band: "lower" });
  });
});

describe("writing estimate", () => {
  it("starts at the middle of the first judged level", () => {
    expect(updateWriting(undefined, "A2")).toEqual({ theta: 2.5, n: 1 });
  });

  it("averages later judgements, giving recent answers at least 20% weight", () => {
    let p = updateWriting(undefined, "A2"); // 2.5
    p = updateWriting(p, "B1"); // weight 1/2 -> 3.0
    expect(p.theta).toBeCloseTo(3.0, 5);
    for (let i = 0; i < 30; i++) p = updateWriting(p, "B1");
    expect(p.theta).toBeGreaterThan(3.45); // converges to B1 middle (3.5)
    const before = p.theta;
    expect(updateWriting(p, "A2").theta).toBeCloseTo(before + 0.2 * (2.5 - before), 5);
  });

  it("overall level includes writing only once it has an estimate", () => {
    const r = { theta: 3, n: 4 };
    const l = { theta: 2, n: 4 };
    expect(overallTheta({ reading: r, listening: l })).toBe(2.5);
    expect(overallTheta({ reading: r, listening: l, writing: { theta: 4, n: 2 } })).toBe(3);
  });

  it("a longer answer counts as two observations", () => {
    const p = { theta: 2.5, n: 4 };
    const once = updateWriting(p, "B1");
    const twice = updateWriting(once, "B1");
    expect(updateWriting(p, "B1", 2)).toEqual(twice);
  });
});

