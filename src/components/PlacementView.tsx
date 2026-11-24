import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import type { Lesson, Mode, TaskResult } from "../lib/types";
import { describeTheta, setEstimate } from "../lib/cefr";
import {
  STEP_UP_AT,
  estimateTheta,
  getMonth,
  isComplete,
  monthKey,
  monthLabel,
  openMonth,
  proposal,
  updateMonth,
  type MonthState,
  type StageResult,
} from "../lib/placement";
import { ensureSlot } from "../lib/placementService";
import { ensureExtras } from "../lib/practiceService";
import { insertExtras } from "../lib/practice";
import { withLongWriting, wordRange, writingTarget } from "../lib/writing";
import { describeError, gradeWritten } from "../lib/claude";
import { saveProgress } from "../lib/storage";
import { TaskCard } from "./Tasks";
import { Player } from "./Player";
import { Icon } from "./Icon";
import { LibraryNote } from "./LibraryNote";

const fmtLevel = (theta: number) => {
  const d = describeTheta(theta);
  return `${d.level} ${Math.round(d.progress * 100)}%`;
};

const SKILL_NAME = { reading: "Reading", listening: "Listening", writing: "Writing" } as const;

/** The month this test belongs to: the open end-of-month window, or (started manually) the current month. */
export function placementMonth(now: Date = new Date()): string {
  return openMonth(now) ?? monthKey(now);
}

export function PlacementView() {
  const { navigate, progress, reload, apiKey } = useApp();
  const month = placementMonth();
  const [state, setState] = useState<MonthState>(() => getMonth(month));
  const [running, setRunning] = useState<Mode | null>(null);
  const refresh = () => setState(getMonth(month));

  if (running) {
    return (
      <PlacementRun
        month={month}
        mode={running}
        onExit={() => {
          setRunning(null);
          refresh();
          window.scrollTo(0, 0);
        }}
      />
    );
  }

  const complete = isComplete(state);
  const props = complete ? proposal(state, progress) : [];

  const apply = (yes: boolean) => {
    if (yes) {
      const get = (s: "reading" | "listening" | "writing") => props.find((p) => p.skill === s)?.to;
      const r = get("reading");
      const l = get("listening");
      const w = get("writing");
      saveProgress({
        reading: r !== undefined ? setEstimate(progress.reading, r) : progress.reading,
        listening: l !== undefined ? setEstimate(progress.listening, l) : progress.listening,
        writing: w !== undefined ? setEstimate(progress.writing ?? { theta: w, n: 0 }, w) : progress.writing,
      });
      reload();
    }
    setState(updateMonth(month, (m) => ({ ...m, applied: yes })));
  };

  return (
    <>
      <header className="topbar">
        <h1 style={{ margin: 0 }}>Placement test</h1>
        <button className="btn ghost" onClick={() => navigate("home")} aria-label="Close">
          <Icon name="close" />
        </button>
      </header>
      <p className="small muted">
        {monthLabel(month)} · About 15–20 minutes per part. Two texts each: the first at your current level, the second
        one level higher or lower depending on how you did. No word help or translations. You can do the parts on
        different days.
      </p>

      {(["reading", "listening"] as Mode[]).map((mode) => {
        const r = state.results[mode];
        return (
          <section className="card" key={mode}>
            <div className="row spread">
              <h2 style={{ margin: 0 }}>
                {SKILL_NAME[mode]}
                {mode === "reading" ? " + writing" : ""}
              </h2>
              {r ? <span className="pill">done</span> : null}
            </div>
            {r ? (
              <>
                <ul className="list small" style={{ marginTop: 6 }}>
                  {r.stages.map((s, i) => (
                    <li key={i}>
                      Text {i + 1} · {s.level} · <span lang="el">{s.title}</span> · <strong>{Math.round(s.score * 100)}%</strong>
                    </li>
                  ))}
                  {r.writing && (
                    <li>
                      Longer writing task · level shown: <strong>{r.writing.level}</strong>
                    </li>
                  )}
                </ul>
                <p className="small" style={{ marginBottom: 0 }}>
                  Placement result: <strong>{fmtLevel(r.theta)}</strong>
                </p>
              </>
            ) : (
              <>
                <p className="small muted">
                  {mode === "reading"
                    ? "2 texts with 8 questions each, then one longer written answer."
                    : "2 recordings with 8 questions each."}
                </p>
                <button className="btn primary block" disabled={!apiKey} onClick={() => setRunning(mode)}>
                  Start {SKILL_NAME[mode].toLowerCase()} part
                </button>
              </>
            )}
          </section>
        );
      })}

      {complete && (
        <section className={`card ${state.applied === undefined ? "good" : "soft"}`}>
          <h2>Result</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Current estimate</th>
                <th>Placement test</th>
              </tr>
            </thead>
            <tbody>
              {props.map((p) => (
                <tr key={p.skill}>
                  <td>{SKILL_NAME[p.skill]}</td>
                  <td>{p.from !== undefined ? fmtLevel(p.from) : "–"}</td>
                  <td>
                    <strong>{fmtLevel(p.to)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.applied === undefined ? (
            <>
              <p className="small" style={{ marginTop: 10 }}>
                Apply the placement result as your new level? Your normal sessions then continue from there (and keep
                adjusting).
              </p>
              <div className="row">
                <button className="btn primary" onClick={() => apply(true)}>
                  Apply new levels
                </button>
                <button className="btn" onClick={() => apply(false)}>
                  Keep current levels
                </button>
              </div>
            </>
          ) : (
            <p className="small" style={{ marginTop: 10, marginBottom: 0 }}>
              {state.applied ? "Applied as your new levels." : "You kept your current levels."}
            </p>
          )}
        </section>
      )}
      {complete && state.applied && <LibraryNote snoozable={false} />}

      <p className="tiny">
        How the result is calculated: the level that best fits both of your scores, using the same model as your normal
        level estimate (someone exactly at a level is expected to get about 65% on a text of that level). It's an
        estimate, not a certificate.
        {state.costUsd ? ` Estimated API cost of this test: $${state.costUsd.toFixed(2)}.` : ""}
      </p>
    </>
  );
}

/* ---------------- One part (2 stages) ---------------- */

type Phase = "loading" | "text" | "tasks" | "grading" | "error";

function PlacementRun({ month, mode, onExit }: { month: string; mode: Mode; onExit: () => void }) {
  const { apiKey, settings, progress, sessions, updateSettings } = useApp();
  const [stage, setStage] = useState<1 | 2>(1);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [step, setStep] = useState("Preparing the first text…");
  const [error, setError] = useState<string | null>(null);
  const [taskIdx, setTaskIdx] = useState(0);
  const [results, setResults] = useState<TaskResult[]>([]);
  const [plays, setPlays] = useState(0);
  const [showText, setShowText] = useState(false);
  const stages = useRef<StageResult[]>([]);
  const slotRef = useRef<"stage1" | "up" | "down">("stage1");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const taskIdxRef = useRef(taskIdx);
  taskIdxRef.current = taskIdx;
  const theta = progress[mode].theta;

  /** Placement form of a lesson: no writing task, except the final reading text, which gets the longer one. */
  const shape = (l: Lesson, final: boolean): Lesson => {
    const withWriting = mode === "reading" && final;
    const base = withWriting ? withLongWriting(l) : l;
    return { ...base, tasks: base.tasks.filter((t) => t.type !== "short_answer" || withWriting) };
  };

  const load = async (slot: "stage1" | "up" | "down", final: boolean) => {
    if (!apiKey) return;
    slotRef.current = slot;
    setPhase("loading");
    setStep(final ? "Preparing the second text…" : "Preparing the first text…");
    try {
      const l = shape(await ensureSlot(apiKey, settings, month, mode, slot, theta, sessions, setStep), final);
      setLesson(l);
      setTaskIdx(0);
      setResults([]);
      setPlays(0);
      setShowText(false);
      setPhase("text");
      window.scrollTo(0, 0);
      // Two more questions (detail, inference) on the same text, if they arrive before the questions end.
      ensureExtras(apiKey, settings, l, mode, [
        { skill: "detail", count: 1 },
        { skill: "inference", count: 1 },
      ])
        .then(({ tasks, costUsd }) => {
          updateMonth(month, (m) => ({ ...m, costUsd: (m.costUsd ?? 0) + costUsd }));
          setLesson((prev) => {
            if (!prev || prev.id !== l.id || prev.tasks.some((t) => t.id.startsWith("x"))) return prev;
            const w = prev.tasks.findIndex((t) => t.type === "short_answer");
            const end = w < 0 ? prev.tasks.length : w;
            const ok = phaseRef.current === "text" || phaseRef.current === "loading" || taskIdxRef.current < end;
            if (!ok) return prev;
            const merged = insertExtras(prev, tasks);
            // In the placement test these are regular questions (they count).
            return { ...merged, tasks: merged.tasks.map((t) => ({ ...t, extra: false })) };
          });
        })
        .catch(() => {
          /* 6 questions are enough if the extras don't come */
        });
      if (!final) {
        // Prepare both possible second texts while the learner works on the first.
        for (const s of ["up", "down"] as const) ensureSlot(apiKey, settings, month, mode, s, theta, sessions).catch(() => {});
      }
    } catch (e) {
      setError(describeError(e));
      setPhase("error");
    }
  };

  useEffect(() => {
    void load("stage1", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishStage = async (res: TaskResult[]) => {
    if (!lesson) return;
    const scored = res.filter((r) => r.type !== "short_answer");
    const score = scored.length ? scored.reduce((a, r) => a + r.score, 0) / scored.length : 0;
    stages.current.push({
      level: lesson.level,
      score,
      lessonId: lesson.id,
      title: lesson.title,
      sourceUrl: lesson.source.url,
    });
    if (stage === 1) {
      setStage(2);
      await load(score >= STEP_UP_AT ? "up" : "down", true);
      return;
    }
    // Stage 2 done: grade the longer writing task (reading part), then save the result.
    let writing: { level: NonNullable<TaskResult["cefr"]>; answer: string; feedback?: string; corrected?: string } | undefined;
    const w = res.find((r) => r.type === "short_answer" && r.userAnswer);
    if (w && apiKey) {
      setPhase("grading");
      try {
        const task = lesson.tasks.find((t) => t.id === w.taskId)!;
        const g = await gradeWritten(
          apiKey,
          settings,
          lesson.level,
          lesson.segments.map((s) => s.text).join("\n"),
          [
            {
              task_id: w.taskId,
              question: task.prompt,
              model_answer: task.explanation,
              learner_answer: w.userAnswer,
              length_target: `${wordRange(writingTarget(lesson.level, true))} words`,
              long: true,
            },
          ],
          "Placement test.",
        );
        updateMonth(month, (m) => ({ ...m, costUsd: (m.costUsd ?? 0) + g.cost.usd }));
        const hit = g.data.results.find((x) => x.task_id === w.taskId);
        if (hit?.cefr_level) writing = { level: hit.cefr_level, answer: w.userAnswer, feedback: hit.feedback, corrected: hit.corrected_answer };
      } catch {
        /* the writing part is optional; reading and listening results still count */
      }
    }
    updateMonth(month, (m) => ({
      ...m,
      results: {
        ...m.results,
        [mode]: { stages: stages.current, theta: estimateTheta(stages.current), completedAt: new Date().toISOString(), writing },
      },
    }));
    onExit();
  };

  const onTaskDone = (r: TaskResult) => {
    const next = [...results, r];
    setResults(next);
    if (lesson && taskIdx + 1 < lesson.tasks.length) {
      setTaskIdx(taskIdx + 1);
      window.scrollTo(0, 0);
    } else void finishStage(next);
  };

  const quit = () => {
    if (window.confirm("Leave the placement test? This part starts again from the first text next time.")) onExit();
  };

  const header = (
    <header className="topbar">
      <div className="row">
        <Icon name={mode === "reading" ? "read" : "ear"} />
        <strong>Placement · {SKILL_NAME[mode]}</strong>
        <span className="pill neutral">text {stage} of 2</span>
      </div>
      <button className="btn ghost" onClick={quit} aria-label="Leave placement test">
        <Icon name="close" />
      </button>
    </header>
  );

  if (phase === "loading" || phase === "grading") {
    return (
      <>
        {header}
        <div className="card" aria-live="polite">
          <div className="row">
            <div className="spinner" />
            <strong>{phase === "grading" ? "Checking your written answer…" : step}</strong>
          </div>
          {phase === "loading" && (
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              If the texts weren't prepared in advance, this can take a few minutes.
            </p>
          )}
        </div>
      </>
    );
  }

  if (phase === "error") {
    return (
      <>
        {header}
        <div className="card bad" role="alert">
          <h2>Something went wrong</h2>
          <p className="small">{error}</p>
        </div>
        <button className="btn primary block" onClick={() => void load(slotRef.current, stage === 2)}>
          Try again
        </button>
      </>
    );
  }

  if (!lesson) return null;

  if (phase === "text") {
    return (
      <>
        {header}
        <p className="small muted">
          {mode === "reading" ? "Read the text. No word help in the placement test." : "Listen. You may replay it."}
        </p>
        {mode === "reading" ? (
          <article className="card">
            <h1 lang="el" style={{ fontFamily: "var(--font-read)" }}>
              {lesson.title}
            </h1>
            <PlainText lesson={lesson} />
          </article>
        ) : (
          <section className="card">
            <h1 lang="el" style={{ fontFamily: "var(--font-read)" }}>
              {lesson.title}
            </h1>
            <Player
              segments={lesson.segments}
              audioUrl={lesson.source.audioUrl}
              voiceURI={settings.voiceURI}
              rate={settings.speechRate}
              // Original recordings stay at natural speed in the test (the Centre graded them that way).
              onRateChange={lesson.source.audioUrl ? undefined : (r) => updateSettings({ speechRate: r })}
              onListen={() => setPlays((p) => p + 1)}
            />
          </section>
        )}
        <button
          className="btn primary block big"
          disabled={mode === "listening" && plays === 0}
          onClick={() => {
            setPhase("tasks");
            window.scrollTo(0, 0);
          }}
        >
          Go to the questions
        </button>
      </>
    );
  }

  const task = lesson.tasks[taskIdx];
  return (
    <>
      {header}
      <div className="progress-dots" aria-hidden="true">
        {lesson.tasks.map((_, i) => (
          <i key={i} className={i < taskIdx ? "done" : i === taskIdx ? "now" : ""} />
        ))}
      </div>
      <TaskCard key={task.id} task={task} level={lesson.level} index={taskIdx} total={lesson.tasks.length} onDone={onTaskDone} />
      <div className="card soft">
        {showText ? (
          <>
            <button className="btn ghost" onClick={() => setShowText(false)}>
              {mode === "reading" ? "Hide text" : "Hide player"}
            </button>
            {mode === "reading" ? (
              <PlainText lesson={lesson} />
            ) : (
              <Player segments={lesson.segments} audioUrl={lesson.source.audioUrl} voiceURI={settings.voiceURI} rate={settings.speechRate} compact />
            )}
          </>
        ) : (
          <button className="btn ghost" onClick={() => setShowText(true)}>
            {mode === "reading" ? "Look back at the text" : "Listen again"}
          </button>
        )}
      </div>
    </>
  );
}

function PlainText({ lesson }: { lesson: Lesson }) {
  const multi = lesson.segments.some((s) => s.speaker);
  return (
    <div className="reading" lang="el">
      {lesson.segments.map((s, i) => (
        <p key={i}>
          {multi && s.speaker && <span className="speaker">{s.speaker}</span>}
          {s.text}
        </p>
      ))}
    </div>
  );
}
