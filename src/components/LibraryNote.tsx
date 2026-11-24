import { useState } from "react";
import { useApp } from "../App";
import type { Cefr, Mode } from "../lib/types";
import { targetFor } from "../lib/cefr";
import { builtInLeft, LOW_LIBRARY } from "../lib/library";

const SNOOZE_KEY = "akou.libnote.v1";
const SNOOZE_DAYS = 7;

interface Snooze {
  /** Which situation was snoozed (levels per mode), so a new level shows the note again. */
  key: string;
  until: string;
}

function loadSnooze(): Snooze | null {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "null") as Snooze | null;
  } catch {
    return null;
  }
}

/**
 * Restock reminder: shown when fewer than LOW_LIBRARY unused built-in lessons
 * are left at the learner's level for reading or listening. The app can't
 * write library lessons itself (no server); restocking is done in Claude Code.
 *
 * `levels` checks specific levels (e.g. the ones just applied from a placement
 * test); otherwise the current target levels are used.
 */
export function LibraryNote({ levels, snoozable = true }: { levels?: Record<Mode, Cefr>; snoozable?: boolean }) {
  const { settings, progress, sessions } = useApp();
  const [, force] = useState(0);
  const lv: Record<Mode, Cefr> = levels ?? {
    reading: targetFor(progress.reading.theta, settings.levelOverride).level,
    listening: targetFor(progress.listening.theta, settings.levelOverride).level,
  };
  const left = (["reading", "listening"] as Mode[]).map((mode) => ({
    mode,
    level: lv[mode],
    n: builtInLeft(mode, lv[mode], sessions),
  }));
  if (!left.some((x) => x.n < LOW_LIBRARY)) return null;

  const key = left.map((x) => `${x.mode}:${x.level}`).join(",");
  const snooze = loadSnooze();
  if (snoozable && snooze && snooze.key === key && new Date(snooze.until) > new Date()) return null;

  const parts = left.map((x) => `${x.n} ${x.level} ${x.mode}`);
  return (
    <section className="card warn" aria-label="Built-in lessons running low">
      <h2 style={{ marginBottom: 4 }}>Built-in lessons are running low</h2>
      <p className="small" style={{ marginBottom: 8 }}>
        Left at your level: {parts.join(", ")}. Built-in lessons come with word translations and cost nothing. When
        they run out, the app writes every new lesson with your API key, which uses credit.
      </p>
      <p className="small" style={{ marginBottom: snoozable ? 10 : 0 }}>
        To restock, open Claude Code on the app's repository and ask it to add lessons to the library (steps in{" "}
        <code>docs/LIBRARY.md</code>).
      </p>
      {snoozable && (
        <button
          className="btn"
          onClick={() => {
            try {
              const until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString();
              localStorage.setItem(SNOOZE_KEY, JSON.stringify({ key, until }));
            } catch {
              /* storage blocked: the note just stays */
            }
            force((n) => n + 1);
          }}
        >
          Remind me in a week
        </button>
      )}
    </section>
  );
}
