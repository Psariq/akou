import { beforeEach, describe, expect, it } from "vitest";
import { addGloss, findGloss, getGlosses, hasGlosses, saveGlosses, sentenceAround, tokenize } from "./glosses";

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
(globalThis as any).window = { dispatchEvent: () => true };

describe("tokenize", () => {
  it("splits words and keeps everything else", () => {
    const text = "«Γεια σου», είπε η Μαρία. Τι κάνεις;";
    const toks = tokenize(text);
    expect(toks.map((t) => t.text).join("")).toBe(text);
    expect(toks.filter((t) => t.word).map((t) => t.text)).toEqual(["Γεια", "σου", "είπε", "η", "Μαρία", "Τι", "κάνεις"]);
  });
  it("splits elided forms (σ’ αγαπώ) into separate words, which still match glosses written with the apostrophe", () => {
    expect(tokenize("Γι' αυτό σ’ αγαπώ").filter((t) => t.word).map((t) => t.text)).toEqual(["Γι", "αυτό", "σ", "αγαπώ"]);
    expect(findGloss([{ form: "σ'", lemma: "εσύ", en: "you", note: "" }], "σ")?.lemma).toBe("εσύ");
  });
});

describe("findGloss", () => {
  const entries = [
    { form: "πούλησε", lemma: "πουλάω", en: "sold", note: "aorist, 3rd sg." },
    { form: "η", lemma: "ο", en: "the", note: "article, nom. sg. f." },
  ];
  it("matches regardless of case", () => {
    expect(findGloss(entries, "Η")?.en).toBe("the");
  });
  it("falls back to an accent-insensitive match", () => {
    expect(findGloss(entries, "ΠΟΥΛΗΣΕ")?.lemma).toBe("πουλάω");
  });
  it("returns null for unknown words", () => {
    expect(findGloss(entries, "θάλασσα")).toBeNull();
  });
});

describe("sentenceAround", () => {
  it("returns the sentence containing the position", () => {
    const t = "Πρώτη πρόταση. Η Μαρία πούλησε ψωμί. Τρίτη πρόταση;";
    expect(sentenceAround(t, t.indexOf("πούλησε"))).toBe("Η Μαρία πούλησε ψωμί.");
  });
});

describe("gloss store", () => {
  beforeEach(() => mem.clear());
  it("a single looked-up word does not count as a glossed lesson", () => {
    addGloss("L1", { form: "ψωμί", lemma: "το ψωμί", en: "bread", note: "" });
    expect(hasGlosses("L1")).toBe(false);
    expect(getGlosses("L1")?.entries).toHaveLength(1);
  });
  it("full glosses mark the lesson complete and keep earlier lookups", () => {
    addGloss("L1", { form: "ψωμί", lemma: "το ψωμί", en: "bread", note: "" });
    saveGlosses("L1", [{ form: "Μαρία", lemma: "Μαρία", en: "Maria", note: "" }, ...getGlosses("L1")!.entries], 0.05);
    expect(hasGlosses("L1")).toBe(true);
    expect(getGlosses("L1")?.entries.map((e) => e.form)).toEqual(["Μαρία", "ψωμί"]);
    expect(getGlosses("L1")?.costUsd).toBe(0.05);
  });
  it("de-duplicates forms", () => {
    saveGlosses("L2", [
      { form: "Η", lemma: "ο", en: "the", note: "" },
      { form: "η", lemma: "ο", en: "the", note: "" },
    ], 0);
    expect(getGlosses("L2")?.entries).toHaveLength(1);
  });
});

describe("bundled translations (built-in library)", () => {
  it("are available without any API call, and words looked up later are added", () => {
    mem.clear();
    expect(hasGlosses("lib-reading-A2-01")).toBe(true);
    const g = getGlosses("lib-reading-A2-01")!;
    expect(g.costUsd).toBe(0);
    expect(g.entries.length).toBeGreaterThan(50);
    addGloss("lib-reading-A2-01", { form: "ζζζ", lemma: "ζζζ", en: "test", note: "" });
    expect(findGloss(getGlosses("lib-reading-A2-01")!.entries, "ζζζ")?.en).toBe("test");
    expect(getGlosses("lib-reading-A2-01")!.entries.length).toBe(g.entries.length + 1);
  });

  it("do not exist for other lessons", () => {
    mem.clear();
    expect(hasGlosses("wiki-reading-B1-karagiozis")).toBe(false);
    expect(getGlosses("wiki-reading-B1-karagiozis")).toBeNull();
  });
});
