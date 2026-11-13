import type { Task, VocabPair } from "./types";

/** Lowercase (Greek-aware), trim, drop punctuation, collapse whitespace. Keeps accents. */
export function normalize(s: string): string {
  return s
    .normalize("NFC")
    .toLocaleLowerCase("el")
    .replace(/[.,;:!?·«»"'“”‘’()\[\]{}…\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** As normalize(), but also strips accents/diaeresis and unifies final sigma. */
export function normalizeLoose(s: string): string {
  return normalize(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ς/g, "σ")
    .normalize("NFC");
}

export interface LocalGrade {
  score: number;
  feedback?: string;
}

export function gradeChoice(task: Task, chosen: number): LocalGrade {
  return { score: chosen === task.correct_index ? 1 : 0 };
}

/**
 * Gap fill: exact match (ignoring case/punctuation) = 1.
 * Right word but wrong/missing accents = 0.75, with a hint.
 */
export function gradeGap(task: Task, answer: string): LocalGrade {
  const a = normalize(answer);
  if (!a) return { score: 0 };
  const accepted = task.accepted_answers.filter((x) => x.trim().length > 0);
  if (accepted.some((x) => normalize(x) === a)) return { score: 1 };
  const loose = normalizeLoose(answer);
  const hit = accepted.find((x) => normalizeLoose(x) === loose);
  if (hit) return { score: 0.75, feedback: `Right word, check the accents/spelling: ${hit}` };
  return { score: 0 };
}

/** Vocab match: fraction of pairs matched correctly. `matches[i]` = English chosen for pair i. */
export function gradeMatch(pairs: VocabPair[], matches: (string | null)[]): LocalGrade {
  if (pairs.length === 0) return { score: 0 };
  const right = pairs.filter((p, i) => matches[i] === p.english).length;
  return { score: right / pairs.length };
}

/** Basic sanity check on a generated task; malformed tasks are dropped. */
export function isUsableTask(t: Task): boolean {
  switch (t.type) {
    case "multiple_choice":
    case "true_false":
      return t.options.length >= 2 && t.correct_index >= 0 && t.correct_index < t.options.length;
    case "gap_fill":
      return t.prompt.includes("___") && t.accepted_answers.some((a) => a.trim().length > 0);
    case "vocab_match":
      return t.pairs.length >= 2 && new Set(t.pairs.map((p) => p.english)).size === t.pairs.length;
    case "short_answer":
      return t.prompt.trim().length > 0;
    default:
      return false;
  }
}

/** Deterministic-enough shuffle for UI options. */
export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
