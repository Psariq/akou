import type { GlossaryItem, Mode, SessionRecord, TaskSkill } from "./types";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Consecutive days (ending today or yesterday) with at least one session. */
export function streakDays(sessions: SessionRecord[], now: Date = new Date()): number {
  const days = new Set(sessions.map((s) => dayKey(new Date(s.date))));
  const cur = new Date(now);
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(cur))) {
    n++;
    cur.setDate(cur.getDate() - 1);
  }
  return n;
}

export function totalMinutes(sessions: SessionRecord[]): number {
  return Math.round(sessions.reduce((a, s) => a + s.exposureSec + s.tasksSec, 0) / 60);
}

export const SKILLS: TaskSkill[] = ["gist", "detail", "inference", "vocabulary", "grammar", "writing"];

export const SKILL_LABEL: Record<TaskSkill, string> = {
  gist: "Main idea",
  detail: "Details",
  inference: "Inference",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  writing: "Writing",
};

export function accuracyBySkill(sessions: SessionRecord[], mode?: Mode): { skill: TaskSkill; pct: number; n: number }[] {
  const acc = new Map<TaskSkill, { sum: number; n: number }>();
  for (const s of sessions) {
    if (mode && s.mode !== mode) continue;
    for (const r of s.taskResults) {
      const a = acc.get(r.skill) ?? { sum: 0, n: 0 };
      a.sum += r.score;
      a.n += 1;
      acc.set(r.skill, a);
    }
  }
  return SKILLS.map((skill) => {
    const a = acc.get(skill);
    return { skill, pct: a && a.n ? a.sum / a.n : 0, n: a?.n ?? 0 };
  });
}

export function costThisMonth(sessions: SessionRecord[], now: Date = new Date()): number {
  return sessions
    .filter((s) => {
      const d = new Date(s.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((a, s) => a + s.costUsd, 0);
}

/** Recent glossary words, newest first, de-duplicated. */
export function recentWords(sessions: SessionRecord[], limit = 60): GlossaryItem[] {
  const seen = new Set<string>();
  const out: GlossaryItem[] = [];
  for (let i = sessions.length - 1; i >= 0 && out.length < limit; i--) {
    for (const g of sessions[i].glossary) {
      const k = g.greek.toLocaleLowerCase("el");
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(g);
      if (out.length >= limit) break;
    }
  }
  return out;
}
