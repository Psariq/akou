import { describe, expect, it } from "vitest";
import { MEDIA, TEXTBANK, mediaUrl, pickMedia, pickMixedSource, pickTextbank, skipMedia, textbankUrl } from "./sources";
import { DEFAULT_SETTINGS } from "./storage";
import type { Settings } from "./types";

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe("source policy for Mixed / background lessons", () => {
  it("never picks news, and uses AI-written texts only for listening", () => {
    const seen = { reading: new Set<string>(), listening: new Set<string>() };
    for (let r = 0; r < 1; r += 0.01) {
      seen.reading.add(pickMixedSource(DEFAULT_SETTINGS, "reading", () => r));
      seen.listening.add(pickMixedSource(DEFAULT_SETTINGS, "listening", () => r));
    }
    expect([...seen.reading].sort()).toEqual(["textbank", "wikipedia"]);
    expect([...seen.listening].sort()).toEqual(["ai", "textbank", "wikipedia"]);
  });

  it("prefers the graded text bank (60%)", () => {
    expect(pickMixedSource(DEFAULT_SETTINGS, "reading", seq(0.59))).toBe("textbank");
    expect(pickMixedSource(DEFAULT_SETTINGS, "reading", seq(0.61))).toBe("wikipedia");
  });

  it("respects disabled sources", () => {
    const s: Settings = { ...DEFAULT_SETTINGS, sources: { textbank: false, wikipedia: true, news: true, ai: true } };
    expect(pickMixedSource(s, "reading", seq(0.1))).toBe("wikipedia");
    const none: Settings = { ...DEFAULT_SETTINGS, sources: { textbank: false, wikipedia: false, news: true, ai: true } };
    expect(pickMixedSource(none, "reading")).toBe("ai");
  });
});

describe("text bank", () => {
  it("has graded reading and listening texts from A2 to C1", () => {
    for (const level of ["A2", "B1", "B2", "C1"] as const) {
      expect(TEXTBANK.filter((t) => t.level === level && t.skill === "reading").length).toBeGreaterThan(10);
      expect(TEXTBANK.filter((t) => t.level === level && t.skill === "listening").length).toBeGreaterThan(10);
    }
  });

  it("picks an unused text of the right level and skill", () => {
    const t = pickTextbank("listening", "B1", new Set(), seq(0));
    expect(t?.level).toBe("B1");
    expect(t?.skill).toBe("listening");
    const all = new Set(TEXTBANK.filter((x) => x.level === "B1" && x.skill === "listening").map((x) => textbankUrl(x.id)));
    expect(pickTextbank("listening", "B1", all)).toBeNull();
  });
});

describe("multimedia bank (original recordings)", () => {
  it("has graded audio at A2 to C2, each with an https mp3 on the Centre's site", () => {
    for (const lv of ["A2", "B1", "B2", "C1", "C2"] as const) expect(MEDIA.filter((m) => m.level === lv).length).toBeGreaterThan(0);
    for (const m of MEDIA) expect(m.audio).toMatch(/^https:\/\/www\.greek-language\.gr\/certification\/files\/audio\/.+\.mp3$/);
    expect(new Set(MEDIA.map((m) => m.id)).size).toBe(MEDIA.length);
  });

  it("picks an unused recording at exactly the level, and never one that failed before", () => {
    const mem = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const a2 = MEDIA.filter((m) => m.level === "A2");
    const used = new Set(a2.slice(1).map((m) => mediaUrl(m.id)));
    expect(pickMedia("A2", used)?.id).toBe(a2[0].id);
    skipMedia(mediaUrl(a2[0].id));
    expect(pickMedia("A2", used)).toBeNull();
    expect(pickMedia("A1", new Set())).toBeNull(); // no A1 audio in the bank
    delete (globalThis as any).localStorage;
  });
});
