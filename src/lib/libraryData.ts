import type { Cefr, GlossEntry, Mode, TaskSkill, TaskType } from "./types";

/**
 * Raw lesson format of the built-in lessons (src/data/starter, src/data/open,
 * src/data/library). Compact on purpose: these files are written by hand.
 */
export interface RawTask {
  type: TaskType;
  skill: TaskSkill;
  prompt: string;
  en: string;
  options?: string[];
  answer?: number;
  accept?: string[];
  pairs?: [string, string][];
  explain?: string;
}

export interface RawLesson {
  id: string;
  mode?: Mode;
  level?: Cefr;
  source?: { title: string; url: string; revid: number };
  title: string;
  title_en: string;
  topic: string;
  segments: (string | string[])[];
  glossary: string[][];
  tasks: RawTask[];
}

/** One word translation: [form as in the text, dictionary form, meaning in this text, grammar note]. */
export type RawGloss = [string, string, string, string];

/** A lesson of the larger library: mode, level and word translations included. */
export interface LibraryLesson extends RawLesson {
  mode: Mode;
  level: Cefr;
  words: RawGloss[];
}

/**
 * Every JSON file in src/data/library holds an array of lessons. New files
 * are picked up automatically (restocking = adding a file; see docs/LIBRARY.md).
 * Files are read in name order, so lessons keep a stable order.
 */
const files = import.meta.glob("../data/library/*.json", { eager: true, import: "default" }) as Record<
  string,
  LibraryLesson[]
>;

export const LIBRARY: LibraryLesson[] = Object.keys(files)
  .sort()
  .flatMap((k) => files[k]);

const GLOSSES = new Map<string, GlossEntry[]>(
  LIBRARY.map((l) => [l.id, l.words.map(([form, lemma, en, note]) => ({ form, lemma, en, note }))]),
);

/** Word translations shipped with a built-in lesson, or null. */
export function bundledGlosses(lessonId: string): GlossEntry[] | null {
  return GLOSSES.get(lessonId) ?? null;
}
