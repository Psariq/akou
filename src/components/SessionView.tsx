import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import type { Lesson, SessionRecord, SourceKind, TaskResult, UsageCost } from "../lib/types";
import { describeTheta, targetFor, updateProgress, type Target } from "../lib/cefr";
import { describeError, gradeWritten } from "../lib/claude";
import { createLesson } from "../lib/lessonFactory";
import { availableLessons, loadStock, pickLesson } from "../lib/library";
import { addCost, ZERO_COST } from "../lib/pricing";
import { SKILL_LABEL } from "../lib/stats";
import { TaskCard } from "./Tasks";
import { Player } from "./Player";
import { Icon } from "./Icon";

type Phase = "preparing" | "exposure" | "tasks" | "grading" | "results" | "error";

const SOURCE_NAME: Record<SourceKind, string> = { news: "news", wikipedia: "Wikipedia", ai: "everyday" };
const SOFT_LIMIT_SEC = 5 * 60;

function fmt(sec: number): string {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function SessionView() {
  const app = useApp();
  const { settings, progress, sessions, apiKey, request, navigate, recordSession, updateSettings } = app;
  const mode = request!.mode;

  const [phase, setPhase] = useState<Phase>("preparing");
  const [step, setStep] = useState<string>("Choosing a text…");
  const [error, setError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [waitNote, setWaitNote] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [taskIdx, setTaskIdx] = useState(0);
  const [results, setResults] = useState<TaskResult[]>([]);
  const [plays, setPlays] = useState(0);
  const [showText, setShowText] = useState(false);
  const [showGloss, setShowGloss] = useState(false);
  const [overall, setOverall] = useState<string | undefined>();
  const [record, setRecord] = useState<SessionRecord | null>(null);

  const cost = useRef<UsageCost>(ZERO_COST);
  const t = useRef({ exposureStart: 0, tasksStart: 0, exposureSec: 0, tasksSec: 0 });
  const abort = useRef<AbortController | null>(null);
  const now = useTicker(phase === "exposure" || phase === "tasks");

  /* ---------- 1. prepare: take a ready lesson, or generate one now ---------- */
  useEffect(() => {
    if (!apiKey || !request) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    const tgt = targetFor(progress[mode].theta, settings.levelOverride);
    setTarget(tgt);

    if (!request.url) {
      const ready = pickLesson(availableLessons(mode, sessions, loadStock()), tgt, request.source);
      if (ready) {
        cost.current = { ...ZERO_COST, usd: ready.costUsd };
        setLesson(ready.lesson);
        t.current.exposureStart = Date.now();
        setPhase("exposure");
        return () => ctrl.abort();
      }
      setWaitNote(
        request.source === "mixed"
          ? `No ready ${tgt.level} lesson left, so one is being written now. This can take a few minutes; the library refills itself in the background for next time.`
          : "No ready lesson from this source, so one is being written now. This can take a few minutes. Choose “Mixed” to use ready-made lessons instantly.",
      );
    }

    (async () => {
      try {
        const r = await createLesson(apiKey, settings, mode, tgt, request.source, {
          url: request.url,
          avoidTitles: sessions
            .slice(-40)
            .map((s) => s.source.title)
            .filter((x): x is string => !!x),
          signal: ctrl.signal,
          onStep: setStep,
          onNote: setNote,
        });
        cost.current = addCost(cost.current, r.cost);
        setLesson(r.lesson);
        t.current.exposureStart = Date.now();
        setPhase("exposure");
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError(describeError(e));
        setPhase("error");
      }
    })();

    return () => ctrl.abort();
    // Run once per session start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- transitions ---------- */
  const startTasks = () => {
    t.current.exposureSec = (Date.now() - t.current.exposureStart) / 1000;
    t.current.tasksStart = Date.now();
    setShowText(false);
    setPhase("tasks");
    window.scrollTo(0, 0);
  };

  const onTaskDone = (r: TaskResult) => {
    const next = [...results, r];
    setResults(next);
    if (lesson && taskIdx + 1 < lesson.tasks.length) {
      setTaskIdx(taskIdx + 1);
      window.scrollTo(0, 0);
    } else {
      void finish(next);
    }
  };

  const finish = async (res: TaskResult[], skipGrading = false) => {
    if (!lesson || !target || !apiKey) return;
    let final = res;
    let comment: string | undefined;
    const written = res.filter((r) => r.type === "short_answer" && r.userAnswer);

    if (written.length && !skipGrading) {
      setPhase("grading");
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const text = lesson.segments.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join("\n");
        const auto = res
          .filter((r) => r.type !== "short_answer")
          .map((r) => `${SKILL_LABEL[r.skill]}: ${Math.round(r.score * 100)}%`)
          .join(", ");
        const g = await gradeWritten(
          apiKey,
          settings,
          target.level,
          text,
          written.map((w) => {
            const task = lesson.tasks.find((x) => x.id === w.taskId)!;
            return { task_id: w.taskId, question: task.prompt, model_answer: task.explanation, learner_answer: w.userAnswer };
          }),
          `Auto-graded tasks: ${auto || "none"}.`,
          ctrl.signal,
        );
        cost.current = addCost(cost.current, g.cost);
        comment = g.data.overall_comment;
        final = res.map((r) => {
          const hit = g.data.results.find((x) => x.task_id === r.taskId);
          return hit
            ? { ...r, score: Math.min(1, Math.max(0, hit.score)), feedback: hit.feedback, corrected: hit.corrected_answer }
            : r;
        });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError(`Grading failed: ${describeError(e)}`);
        setResults(res);
        setPhase("error");
        return;
      }
    }

    // Ungraded written answers (grading skipped) don't count toward the score.
    const counted = final.filter((r) => !(r.type === "short_answer" && r.userAnswer && skipGrading));
    const score = counted.length ? counted.reduce((a, r) => a + r.score, 0) / counted.length : 0;
    t.current.tasksSec = (Date.now() - t.current.tasksStart) / 1000;

    const before = progress[mode];
    const after = updateProgress(before, lesson.level, score);
    const rec: SessionRecord = {
      id: `${Date.now()}`,
      lessonId: lesson.id,
      date: new Date().toISOString(),
      mode,
      level: lesson.level,
      title: lesson.title,
      topic: lesson.topic,
      source: lesson.source,
      score,
      taskResults: final,
      exposureSec: Math.round(t.current.exposureSec),
      tasksSec: Math.round(t.current.tasksSec),
      plays: mode === "listening" ? plays : undefined,
      thetaBefore: before.theta,
      thetaAfter: after.theta,
      costUsd: cost.current.usd,
      glossary: lesson.glossary,
      overallComment: comment,
    };
    recordSession(rec, { ...progress, [mode]: after });
    setResults(final);
    setOverall(comment);
    setRecord(rec);
    setPhase("results");
    window.scrollTo(0, 0);
  };

  const quit = () => {
    if (phase !== "results" && phase !== "error" && phase !== "preparing" && !window.confirm("Leave this session? Progress in it won't be saved.")) return;
    abort.current?.abort();
    navigate("home");
  };

  /* ---------- render ---------- */
  const header = (
    <header className="topbar">
      <div className="row">
        <Icon name={mode === "reading" ? "read" : "ear"} />
        <strong>{mode === "reading" ? "Reading" : "Listening"}</strong>
        {lesson && <span className="pill">{lesson.level}</span>}
        {lesson && <span className="pill neutral">{lesson.source.starter ? "starter" : SOURCE_NAME[lesson.source.kind]}</span>}
      </div>
      <button className="btn ghost" onClick={quit} aria-label="Leave session">
        <Icon name="close" />
      </button>
    </header>
  );

  if (!apiKey) {
    return (
      <>
        {header}
        <div className="card warn">An API key is needed. Add one in Settings.</div>
      </>
    );
  }

  if (phase === "preparing") {
    return (
      <>
        {header}
        <div className="card" aria-live="polite">
          <div className="row">
            <div className="spinner" />
            <strong>{step}</strong>
          </div>
          <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
            {target && `Target level: ${target.level} (${target.band} end).`}
          </p>
          {waitNote && <p className="small" style={{ marginTop: 8 }}>{waitNote}</p>}
          {note && <p className="small" style={{ marginTop: 8 }}>{note}</p>}
        </div>
        <button className="btn block" onClick={quit}>
          Cancel
        </button>
      </>
    );
  }

  if (phase === "error") {
    const gradingFailed = results.length > 0 && lesson;
    return (
      <>
        {header}
        <div className="card bad" role="alert">
          <h2>Something went wrong</h2>
          <p className="small">{error}</p>
        </div>
        <div className="stack">
          {gradingFailed ? (
            <>
              <button className="btn primary block" onClick={() => void finish(results)}>
                Retry grading
              </button>
              <button className="btn block" onClick={() => void finish(results, true)}>
                Finish without grading the written answer
              </button>
            </>
          ) : (
            <button className="btn primary block" onClick={() => app.startSession({ mode, source: request!.source, url: request!.url })}>
              Try again
            </button>
          )}
          <button className="btn block" onClick={() => navigate("home")}>
            Back to start
          </button>
        </div>
      </>
    );
  }

  if (!lesson) return null;

  if (phase === "exposure") {
    const elapsed = (now - t.current.exposureStart) / 1000;
    return (
      <>
        {header}
        {note && <div className="card soft small">{note}</div>}
        <div className="row spread" style={{ marginBottom: 8 }}>
          <span className="small muted">{mode === "reading" ? "Read the text. Take your time." : "Listen. You may replay it."}</span>
          <span className={`timer ${elapsed > SOFT_LIMIT_SEC ? "over" : ""}`} aria-label="Elapsed time">
            {fmt(elapsed)}
          </span>
        </div>

        {mode === "reading" ? (
          <article className="card">
            <h1 lang="el" style={{ fontFamily: "var(--font-read)" }}>
              {lesson.title}
            </h1>
            <LessonText lesson={lesson} />
          </article>
        ) : (
          <section className="card">
            <h1 lang="el" style={{ fontFamily: "var(--font-read)" }}>
              {lesson.title}
            </h1>
            <p className="small muted">
              {new Set(lesson.segments.map((s) => s.speaker)).size > 1 ? "A conversation" : "One speaker"} · listened {plays}×
            </p>
            <Player
              segments={lesson.segments}
              voiceURI={settings.voiceURI}
              rate={settings.speechRate}
              onRateChange={(r) => updateSettings({ speechRate: r })}
              onListen={() => setPlays((p) => p + 1)}
            />
          </section>
        )}

        <div className="card soft">
          {showGloss ? (
            <>
              <h3>{mode === "reading" ? "Word help" : "Key words"}</h3>
              <Glossary lesson={lesson} />
            </>
          ) : (
            <button className="btn ghost" onClick={() => setShowGloss(true)}>
              {mode === "reading" ? "Show word help" : "Show key words before listening"}
            </button>
          )}
        </div>

        <button className="btn primary block big" onClick={startTasks} disabled={mode === "listening" && plays === 0}>
          Go to the questions ({lesson.tasks.length})
        </button>
      </>
    );
  }

  if (phase === "tasks") {
    const task = lesson.tasks[taskIdx];
    const elapsed = (now - t.current.tasksStart) / 1000;
    return (
      <>
        {header}
        <div className="progress-dots" aria-hidden="true">
          {lesson.tasks.map((_, i) => (
            <i key={i} className={i < taskIdx ? "done" : i === taskIdx ? "now" : ""} />
          ))}
        </div>
        <div className="row spread small muted" style={{ marginBottom: 8 }}>
          <span>Questions</span>
          <span className={`timer ${elapsed > SOFT_LIMIT_SEC ? "over" : ""}`}>{fmt(elapsed)}</span>
        </div>
        <TaskCard key={task.id} task={task} index={taskIdx} total={lesson.tasks.length} onDone={onTaskDone} />
        <div className="card soft">
          {mode === "reading" ? (
            showText ? (
              <>
                <button className="btn ghost" onClick={() => setShowText(false)}>
                  Hide text
                </button>
                <LessonText lesson={lesson} />
              </>
            ) : (
              <button className="btn ghost" onClick={() => setShowText(true)}>
                Look back at the text
              </button>
            )
          ) : showText ? (
            <>
              <button className="btn ghost" onClick={() => setShowText(false)}>
                Hide player
              </button>
              <Player
                segments={lesson.segments}
                voiceURI={settings.voiceURI}
                rate={settings.speechRate}
                onListen={() => setPlays((p) => p + 1)}
                compact
              />
            </>
          ) : (
            <button className="btn ghost" onClick={() => setShowText(true)}>
              Listen again
            </button>
          )}
        </div>
      </>
    );
  }

  if (phase === "grading") {
    return (
      <>
        {header}
        <div className="card" aria-live="polite">
          <div className="row">
            <div className="spinner" />
            <strong>Checking your written answer…</strong>
          </div>
        </div>
      </>
    );
  }

  /* ---------- results ---------- */
  if (!record) return null;
  const before = describeTheta(record.thetaBefore);
  const after = describeTheta(record.thetaAfter);
  const delta = record.thetaAfter - record.thetaBefore;
  return (
    <>
      {header}
      <section className={`card ${record.score >= 0.7 ? "good" : record.score >= 0.45 ? "" : "warn"}`}>
        <div className="tiny">Score</div>
        <div className="level-big">{Math.round(record.score * 100)}%</div>
        <p className="small" style={{ marginTop: 8 }}>
          {mode === "reading" ? "Reading" : "Listening"} estimate: {before.level} {Math.round(before.progress * 100)}% →{" "}
          <strong>
            {after.level} {Math.round(after.progress * 100)}%
          </strong>{" "}
          ({delta >= 0 ? "+" : ""}
          {Math.round(delta * 100)} points; 100 points = one CEFR level)
        </p>
        {overall && <p className="small" style={{ marginBottom: 0 }}>{overall}</p>}
      </section>

      <section className="card">
        <h2>Your answers</h2>
        <ul className="list">
          {lesson.tasks.map((task) => {
            const r = results.find((x) => x.taskId === task.id);
            if (!r) return null;
            return (
              <li key={task.id}>
                <div className="row spread">
                  <span className="small muted">{SKILL_LABEL[task.skill]}</span>
                  <span className="small" style={{ fontWeight: 600, color: r.score >= 1 ? "var(--good)" : r.score > 0 ? "var(--warn)" : "var(--bad)" }}>
                    {Math.round(r.score * 100)}%
                  </span>
                </div>
                <div lang="el" style={{ fontFamily: "var(--font-read)" }}>
                  {task.prompt}
                </div>
                <div className="small">
                  You: <span lang="el">{r.userAnswer || "—"}</span>
                </div>
                {task.type === "multiple_choice" || task.type === "true_false" ? (
                  r.score < 1 && (
                    <div className="small">
                      Answer: <span lang="el">{task.options[task.correct_index]}</span>
                    </div>
                  )
                ) : task.type === "gap_fill" && r.score < 1 ? (
                  <div className="small">
                    Answer: <span lang="el">{task.accepted_answers.join(" / ")}</span>
                  </div>
                ) : null}
                {r.corrected && (
                  <div className="small">
                    Corrected: <span lang="el">{r.corrected}</span>
                  </div>
                )}
                {r.feedback && <div className="small muted">{r.feedback}</div>}
                {task.type === "short_answer" && task.explanation && (
                  <details className="small">
                    <summary>Model answer</summary>
                    <span lang="el">{task.explanation}</span>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <details className="card" open={mode === "listening"}>
        <summary>{mode === "reading" ? "The text" : "Transcript"}</summary>
        <h2 lang="el" style={{ fontFamily: "var(--font-read)", marginTop: 8 }}>
          {lesson.title}
        </h2>
        <p className="tiny">{lesson.title_en}</p>
        <LessonText lesson={lesson} />
        <h3>Words</h3>
        <Glossary lesson={lesson} />
      </details>

      <section className="card soft small">
        <SourceLine lesson={lesson} />
        <div className="tiny" style={{ marginTop: 4 }}>
          Estimated API cost of this session: ${record.costUsd.toFixed(3)}
          {cost.current.webSearches ? ` (incl. ${cost.current.webSearches} web search${cost.current.webSearches > 1 ? "es" : ""})` : ""}
        </div>
      </section>

      <div className="stack">
        <button className="btn primary block big" onClick={() => app.startSession({ mode, source: request!.url ? "mixed" : request!.source })}>
          Another {mode === "reading" ? "reading" : "listening"} session
        </button>
        <button className="btn block" onClick={() => navigate("home")}>
          Done
        </button>
      </div>
    </>
  );
}

function LessonText({ lesson }: { lesson: Lesson }) {
  const multi = new Set(lesson.segments.map((s) => s.speaker).filter(Boolean)).size > 0;
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

function Glossary({ lesson }: { lesson: Lesson }) {
  if (!lesson.glossary.length) return <p className="small muted">No glossary for this text.</p>;
  return (
    <dl className="gloss">
      {lesson.glossary.map((g, i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt lang="el">{g.greek}</dt>
          <dd>
            {g.english}
            {g.note && (
              <span className="tiny" lang="el">
                {" "}
                · {g.note}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SourceLine({ lesson }: { lesson: Pick<Lesson, "source"> }) {
  const s = lesson.source;
  if (s.starter) return <div>From Άκου's built-in starter library (texts written by AI, fictional; not reviewed by a native speaker).</div>;
  if (s.kind === "ai") return <div>Original text written by AI for practice (fictional).</div>;
  const name = s.kind === "wikipedia" ? "Greek Wikipedia" : s.publisher ?? "a news site";
  return (
    <div>
      Adapted and simplified by AI from {name}
      {s.title ? (
        <>
          : “
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" lang="el">
              {s.title}
            </a>
          ) : (
            <span lang="el">{s.title}</span>
          )}
          ”
        </>
      ) : null}
      {s.license ? ` (${s.license})` : ""}. Adaptations can contain mistakes; check the original for facts.
    </div>
  );
}
