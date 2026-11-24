import type { Segment } from "./types";

/**
 * Checks that a lesson written from a recording kept the recording's transcript
 * word for word. The learner hears the original audio, so a paraphrased or
 * shortened transcript would no longer match what they hear.
 *
 * Each sentence of the lesson text is looked up in the fetched page (letters
 * and digits only, case-insensitive, so punctuation and quote styles don't
 * matter). At least MIN_MATCH of the words must come from sentences found
 * verbatim on the page.
 */
export const MIN_MATCH = 0.9;
/** A recording's transcript shorter than this is not worth a lesson. */
export const MIN_WORDS = 30;

const norm = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const words = (s: string) => norm(s).split(" ").filter(Boolean).length;

export interface TranscriptCheck {
  ok: boolean;
  /** Share of words in sentences found verbatim on the page (0..1). */
  matched: number;
  words: number;
}

export function checkTranscript(segments: Segment[], pageText: string): TranscriptCheck {
  const page = ` ${norm(pageText)} `;
  let total = 0;
  let found = 0;
  for (const seg of segments) {
    for (const sentence of seg.text.split(/(?<=[.;!?…·»])\s+|\n+/)) {
      const n = words(sentence);
      if (!n) continue;
      total += n;
      if (page.includes(` ${norm(sentence)} `)) found += n;
    }
  }
  const matched = total ? found / total : 0;
  return { ok: total >= MIN_WORDS && matched >= MIN_MATCH, matched, words: total };
}
