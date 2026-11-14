import type { Cefr, Lesson, SessionRecord, Task } from "./types";

/**
 * Longer written answers "from time to time": every Nth exercise, but never
 * twice in one sitting. Exercises less than SITTING_GAP apart count as one
 * sitting (e.g. a reading followed by a listening).
 */
export const SITTING_GAP_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_LONG_WRITING_EVERY = 4;

export function longWritingDue(sessions: SessionRecord[], every: number, now: number = Date.now()): boolean {
  if (!every || every < 1) return false;
  // Already had a longer task in this sitting?
  let i = sessions.length - 1;
  let t = now;
  while (i >= 0 && t - new Date(sessions[i].date).getTime() < SITTING_GAP_MS) {
    if (sessions[i].longWriting) return false;
    t = new Date(sessions[i].date).getTime();
    i--;
  }
  // Every Nth exercise: N-1 normal ones since the last longer task.
  const lastLong = sessions.map((s) => !!s.longWriting).lastIndexOf(true);
  const since = sessions.length - 1 - lastLong;
  return since >= every - 1;
}

export interface LongTarget {
  sentences: string;
  words: [number, number];
}

export function longTarget(level: Cefr): LongTarget {
  if (level === "A1" || level === "A2") return { sentences: "4–6", words: [40, 70] };
  if (level === "B1") return { sentences: "6–8", words: [70, 110] };
  return { sentences: "8–10", words: [110, 160] };
}

/** Turn the lesson's short writing task into a longer one (no API call needed). */
export function withLongWriting(lesson: Lesson): Lesson {
  const t = longTarget(lesson.level);
  return {
    ...lesson,
    tasks: lesson.tasks.map(
      (task): Task =>
        task.type === "short_answer"
          ? {
              ...task,
              long: true,
              prompt: `${task.prompt} Αυτή τη φορά γράψε πιο αναλυτικά: ${t.sentences} προτάσεις. Εξήγησε τη γνώμη σου και δώσε ένα παράδειγμα.`,
              prompt_en: `${task.prompt_en} This time write a longer answer: ${t.sentences} sentences. Explain your opinion and give an example.`,
            }
          : task,
    ),
  };
}

export function hasWritingTask(lesson: Lesson): boolean {
  return lesson.tasks.some((t) => t.type === "short_answer");
}
