import { describe, expect, it } from "vitest";
import { LIBRARY, bundledGlosses } from "./libraryData";
import { STARTER } from "./library";
import { isUsableTask, normalize } from "./grading";
import { findGloss, tokenize } from "./glosses";
import { wordRange } from "./prompts";
import type { Lesson } from "./types";

const byId = new Map([...STARTER.reading, ...STARTER.listening].map((l) => [l.id, l]));
const lessons: Lesson[] = LIBRARY.map((r) => byId.get(r.id)!);
const textOf = (l: Lesson) => l.segments.map((s) => s.text).join("\n");
const countWords = (l: Lesson) => textOf(l).split(/\s+/).filter(Boolean).length;
const SKILLS = ["gist", "detail", "detail", "inference", "vocabulary", "grammar", "writing"];

describe("built-in library", () => {
  it("is loaded into the starter set, with unique ids and titles", () => {
    expect(lessons.every(Boolean)).toBe(true);
    const all = [...STARTER.reading, ...STARTER.listening];
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    expect(new Set(all.map((l) => l.title)).size).toBe(all.length);
  });

  it.each(LIBRARY.map((r) => [r.id, r] as const))("%s: format, length, tasks and translations", (id, raw) => {
    const l = byId.get(id)!;
    // Id encodes mode and level, e.g. lib-reading-A2-01.
    expect(id).toMatch(new RegExp(`^lib-${raw.mode}-${raw.level}-\\d{2}$`));
    expect(l.source.library).toBe(true);
    // Listening scripts have speakers; reading texts don't.
    for (const s of raw.segments) expect(Array.isArray(s), `${id}: segment shape`).toBe(raw.mode === "listening");

    const [lo, hi] = wordRange(raw.mode, raw.level);
    const n = countWords(l);
    expect(n, `${id} has ${n} words (target ${lo}–${hi})`).toBeGreaterThanOrEqual(Math.floor(lo * 0.9));
    expect(n, `${id} has ${n} words (target ${lo}–${hi})`).toBeLessThanOrEqual(Math.ceil(hi * 1.1));

    expect(l.tasks.map((t) => t.skill)).toEqual(SKILLS);
    for (const t of l.tasks) expect(isUsableTask(t), `${id} ${t.id}`).toBe(true);
    for (const t of l.tasks.filter((x) => x.type === "multiple_choice")) {
      expect(new Set(t.options).size, `${id} ${t.id}: 4 distinct options`).toBe(4);
    }
    const vocab = l.tasks.find((t) => t.type === "vocab_match")!;
    expect(vocab.pairs).toHaveLength(4);
    const gap = l.tasks.find((t) => t.type === "gap_fill")!;
    expect(gap.prompt.split("___")).toHaveLength(2);
    const text = normalize(textOf(l));
    expect(
      gap.accepted_answers.some((a) => text.includes(normalize(a))),
      `${id}: the grammar answer comes from the text`,
    ).toBe(true);
    expect(l.glossary.length).toBeGreaterThanOrEqual(6);
    expect(l.tasks.at(-1)!.explanation.length, `${id}: model answer for the writing task`).toBeGreaterThan(20);

    // Every word in the text can be tapped and has a translation; no stray entries.
    const entries = bundledGlosses(id)!;
    const words = tokenize(textOf(l)).filter((t) => t.word).map((t) => t.text);
    const missing = [...new Set(words.filter((w) => !findGloss(entries, w)))];
    expect(missing, `${id}: words without a translation`).toEqual([]);
    const inText = new Set(words.map((w) => normalize(w)));
    const stray = entries.filter((e) => !inText.has(normalize(e.form))).map((e) => e.form);
    expect(stray, `${id}: translations for words not in the text`).toEqual([]);
    for (const e of entries) {
      expect(e.lemma.trim() && e.en.trim(), `${id}: «${e.form}» needs a lemma and a meaning`).toBeTruthy();
    }
  });
});
