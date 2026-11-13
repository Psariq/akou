import { describe, expect, it } from "vitest";
import { parseNewsReply } from "./claude";
import { costOf } from "./pricing";
import { splitSentences } from "./tts";
import { streakDays } from "./stats";
import type { SessionRecord } from "./types";

describe("news reply parsing", () => {
  const facts = "Η κυβέρνηση ανακοίνωσε νέα μέτρα για τη στέγαση. ".repeat(6);
  it("parses the structured reply", () => {
    const r = parseNewsReply(`TITLE: Νέα μέτρα για τη στέγαση\nURL: https://www.ertnews.gr/x\nPUBLISHER: ΕΡΤ\nDATE: unknown\nFACTS:\n${facts}`);
    expect(r?.title).toBe("Νέα μέτρα για τη στέγαση");
    expect(r?.url).toBe("https://www.ertnews.gr/x");
    expect(r?.text.length).toBeGreaterThan(200);
  });
  it("returns null for NOT_FOUND or too little text", () => {
    expect(parseNewsReply("NOT_FOUND: blocked")).toBeNull();
    expect(parseNewsReply("TITLE: x\nFACTS:\nshort")).toBeNull();
  });
  it("drops non-http URLs", () => {
    expect(parseNewsReply(`TITLE: x\nURL: javascript:alert(1)\nFACTS:\n${facts}`)?.url).toBeUndefined();
  });
});

describe("pricing", () => {
  it("estimates cost from usage", () => {
    const c = costOf("claude-sonnet-5-5", { input_tokens: 10_000, output_tokens: 3_000, server_tool_use: { web_search_requests: 1 } });
    // 10k * $2/M + 3k * $10/M + 1 search * $0.01
    expect(c.usd).toBeCloseTo(0.02 + 0.03 + 0.01, 6);
  });
});

describe("sentence splitting", () => {
  it("splits on Greek question marks and full stops", () => {
    expect(splitSentences("Πού πας; Πάω σπίτι. Εντάξει!")).toEqual(["Πού πας;", "Πάω σπίτι.", "Εντάξει!"]);
  });
});

describe("streak", () => {
  it("counts consecutive days ending today or yesterday", () => {
    const mk = (d: string) => ({ date: new Date(d).toISOString() }) as SessionRecord;
    const now = new Date("2026-11-13T12:00:00");
    expect(streakDays([mk("2026-11-11T10:00:00"), mk("2026-11-12T10:00:00"), mk("2026-11-13T09:00:00")], now)).toBe(3);
    expect(streakDays([mk("2026-11-11T10:00:00"), mk("2026-11-12T10:00:00")], now)).toBe(2);
    expect(streakDays([mk("2026-11-10T10:00:00")], now)).toBe(0);
  });
});
