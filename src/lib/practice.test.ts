import { describe, expect, it } from "vitest";
import { insertExtras, planExtras, weakSkills } from "./practice";
import { STARTER } from "./library";
import type { SessionRecord, Task, TaskResult, TaskSkill } from "./types";

const res = (skill: TaskSkill, score: number): TaskResult => ({ taskId: "t", type: "gap_fill", skill, score, userAnswer: "" });
const session = (...r: TaskResult[]) => ({ taskResults: r }) as SessionRecord;

describe("weak areas", () => {
  it("needs at least 4 answers of a type", () => {
    expect(weakSkills([session(res("grammar", 0), res("grammar", 0), res("grammar", 0))])).toEqual([]);
  });

  it("flags types below 60% over the last 10 answers, weakest first", () => {
    const s = [
      session(res("grammar", 0), res("detail", 1), res("vocabulary", 0.5)),
      session(res("grammar", 0.75), res("detail", 1), res("vocabulary", 0.5)),
      session(res("grammar", 0), res("detail", 1), res("vocabulary", 0.5)),
      session(res("grammar", 1), res("detail", 1), res("vocabulary", 0.5)),
    ];
    const w = weakSkills(s);
    expect(w.map((x) => x.skill)).toEqual(["grammar", "vocabulary"]); // 44% and 50%; details at 100% not flagged
    expect(w[0].pct).toBeCloseTo(0.4375, 4);
  });

  it("only looks at the last 10 answers, so improvement switches extras off", () => {
    const old = Array.from({ length: 10 }, () => session(res("grammar", 0)));
    const recent = Array.from({ length: 10 }, () => session(res("grammar", 1)));
    expect(weakSkills([...old, ...recent])).toEqual([]);
  });

  it("never flags main idea or writing", () => {
    const s = Array.from({ length: 5 }, () => session(res("gist", 0), res("writing", 0)));
    expect(weakSkills(s)).toEqual([]);
  });
});

describe("planning extras", () => {
  it("2 per weak type, at most 3 in total", () => {
    expect(planExtras([{ skill: "grammar", pct: 0.2, n: 6 }])).toEqual([{ skill: "grammar", count: 2 }]);
    expect(
      planExtras([
        { skill: "grammar", pct: 0.2, n: 6 },
        { skill: "vocabulary", pct: 0.4, n: 6 },
        { skill: "detail", pct: 0.5, n: 6 },
      ]),
    ).toEqual([
      { skill: "grammar", count: 2 },
      { skill: "vocabulary", count: 1 },
    ]);
  });

  it("inserts extras before the writing task, once", () => {
    const lesson = STARTER.reading[0];
    const extra = { ...lesson.tasks[5], id: "x1", extra: true } as Task;
    const withExtra = insertExtras(lesson, [extra]);
    expect(withExtra.tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4", "t5", "t6", "x1", "t7"]);
    expect(insertExtras(withExtra, [extra]).tasks).toHaveLength(8);
  });
});
