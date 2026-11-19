import { beforeEach, describe, expect, it } from "vitest";
import { droppedSince, loadDropped, loadLedger, recordCost, recordDropped, summarize, trackingSince } from "./ledger";

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

const cost = (usd: number, inTok = 100, outTok = 50) => ({ usd, inputTokens: inTok, outputTokens: outTok, webSearches: 0 });

describe("cost ledger", () => {
  beforeEach(() => mem.clear());

  it("records each response with its job and sums per job, most expensive first", () => {
    recordCost({ job: "glosses" }, "claude-opus-5-5", cost(0.1), new Date("2026-11-10T10:00:00Z"));
    recordCost({ job: "lesson-bg", mode: "reading" }, "claude-opus-5-5", cost(0.3), new Date("2026-11-10T11:00:00Z"));
    recordCost({ job: "lesson-bg", mode: "listening" }, "claude-opus-5-5", cost(0.2, 10, 5), new Date("2026-11-11T11:00:00Z"));
    recordCost({ job: "grading" }, "claude-opus-5-5", cost(0.02), new Date("2026-11-11T12:00:00Z"));
    const l = loadLedger();
    expect(l).toHaveLength(4);
    expect(l[1]).toMatchObject({ job: "lesson-bg", mode: "reading", usd: 0.3, inTok: 100, outTok: 50 });

    const s = summarize(l, new Date("2026-11-01T00:00:00Z"));
    expect(s.rows.map((r) => r.job)).toEqual(["lesson-bg", "glosses", "grading"]);
    expect(s.rows[0]).toMatchObject({ calls: 2, inTok: 110, outTok: 55 });
    expect(s.rows[0].usd).toBeCloseTo(0.5);
    expect(s.total).toBeCloseTo(0.62);
    expect(s.calls).toBe(4);
    expect(trackingSince(l)?.toISOString()).toBe("2026-11-10T10:00:00.000Z");
  });

  it("only counts entries in the period", () => {
    recordCost({ job: "lookup" }, "claude-opus-5-5", cost(0.01), new Date("2026-10-31T23:00:00Z"));
    recordCost({ job: "lookup" }, "claude-opus-5-5", cost(0.02), new Date("2026-11-02T08:00:00Z"));
    const s = summarize(loadLedger(), new Date("2026-11-01T00:00:00Z"));
    expect(s.calls).toBe(1);
    expect(s.total).toBeCloseTo(0.02);
  });

  it("has no tracking start when empty, and survives corrupt storage", () => {
    expect(trackingSince(loadLedger())).toBeNull();
    mem.set("akou.ledger.v1", "{oops");
    expect(loadLedger()).toEqual([]);
    recordCost({ job: "grading" }, "claude-opus-5-5", cost(0.01));
    expect(loadLedger()).toHaveLength(1);
  });

  it("tracks lessons dropped without being used", () => {
    recordDropped(0, new Date("2026-11-05T00:00:00Z")); // nothing paid: ignored
    recordDropped(0.4, new Date("2026-11-05T00:00:00Z"));
    recordDropped(0.3, new Date("2026-10-05T00:00:00Z"));
    expect(loadDropped()).toHaveLength(2);
    const d = droppedSince(loadDropped(), new Date("2026-11-01T00:00:00Z"));
    expect(d.n).toBe(1);
    expect(d.usd).toBeCloseTo(0.4);
  });
});
