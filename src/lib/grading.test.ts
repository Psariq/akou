import { describe, expect, it } from "vitest";
import { gradeGap, gradeMatch, isUsableTask, normalize, normalizeLoose } from "./grading";
import type { Task } from "./types";

const base: Task = {
  id: "t1",
  type: "gap_fill",
  skill: "grammar",
  prompt: "Χθες ___ (πηγαίνω) στη θάλασσα.",
  prompt_en: "",
  options: [],
  correct_index: -1,
  accepted_answers: ["πήγα"],
  pairs: [],
  explanation: "",
};

describe("normalisation", () => {
  it("lowercases Greek and strips punctuation", () => {
    expect(normalize("  Πήγα! ")).toBe("πήγα");
  });
  it("loose form drops accents and final sigma", () => {
    expect(normalizeLoose("Πήγες")).toBe("πηγεσ");
  });
});

describe("gap fill", () => {
  it("full credit for the exact form", () => {
    expect(gradeGap(base, "πήγα").score).toBe(1);
    expect(gradeGap(base, "Πήγα.").score).toBe(1);
  });
  it("partial credit when only accents are wrong", () => {
    const g = gradeGap(base, "πηγα");
    expect(g.score).toBe(0.75);
    expect(g.feedback).toContain("πήγα");
  });
  it("no credit for a wrong form or empty answer", () => {
    expect(gradeGap(base, "πηγαίνω").score).toBe(0);
    expect(gradeGap(base, "  ").score).toBe(0);
  });
});

describe("vocab match", () => {
  it("scores the fraction matched", () => {
    const pairs = [
      { greek: "η απεργία", english: "strike" },
      { greek: "το λιμάνι", english: "port" },
    ];
    expect(gradeMatch(pairs, ["strike", "port"]).score).toBe(1);
    expect(gradeMatch(pairs, ["port", "strike"]).score).toBe(0);
    expect(gradeMatch(pairs, ["strike", null]).score).toBe(0.5);
  });
});

describe("task validation", () => {
  it("rejects malformed tasks", () => {
    expect(isUsableTask(base)).toBe(true);
    expect(isUsableTask({ ...base, prompt: "no gap" })).toBe(false);
    expect(isUsableTask({ ...base, type: "multiple_choice", options: ["a", "b"], correct_index: 2 })).toBe(false);
    expect(isUsableTask({ ...base, type: "multiple_choice", options: ["a", "b"], correct_index: 1 })).toBe(true);
    expect(
      isUsableTask({ ...base, type: "vocab_match", pairs: [{ greek: "α", english: "x" }, { greek: "β", english: "x" }] }),
    ).toBe(false);
  });
});
