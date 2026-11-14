import { useMemo, useState } from "react";
import type { Task, TaskResult } from "../lib/types";
import { gradeChoice, gradeGap, gradeMatch, shuffle, shuffleChoices } from "../lib/grading";

const SKILL_TITLE: Record<Task["skill"], string> = {
  gist: "Main idea",
  detail: "Detail",
  inference: "Reading between the lines",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  writing: "Writing",
};

interface Props {
  task: Task;
  index: number;
  total: number;
  onDone: (r: TaskResult) => void;
}

export function TaskCard({ task: original, index, total, onDone }: Props) {
  const [showEn, setShowEn] = useState(false);
  // Shuffle once per question shown, so the right answer isn't always in the same place.
  const task = useMemo(() => shuffleChoices(original), [original]);
  return (
    <section className="card" aria-label={`Task ${index + 1} of ${total}`}>
      <div className="row spread" style={{ marginBottom: 8 }}>
        <span className="pill neutral">{SKILL_TITLE[task.skill]}</span>
        <span className="tiny">
          {index + 1} / {total}
        </span>
      </div>
      <div className="task-prompt" lang="el">
        {task.type === "gap_fill" ? <GapPrompt text={task.prompt} /> : task.prompt}
      </div>
      {task.prompt_en && (
        <div style={{ marginTop: -6, marginBottom: 10 }}>
          {showEn ? (
            <p className="small muted">{task.prompt_en}</p>
          ) : (
            <button className="btn ghost small" onClick={() => setShowEn(true)}>
              Show English
            </button>
          )}
        </div>
      )}
      {(task.type === "multiple_choice" || task.type === "true_false") && <ChoiceTask task={task} onDone={onDone} />}
      {task.type === "gap_fill" && <GapTask task={task} onDone={onDone} />}
      {task.type === "vocab_match" && <MatchTask task={task} onDone={onDone} />}
      {task.type === "short_answer" && <WritingTask task={task} onDone={onDone} />}
    </section>
  );
}

function GapPrompt({ text }: { text: string }) {
  const parts = text.split("___");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span aria-label="gap"> ______ </span>}
        </span>
      ))}
    </>
  );
}

export const DONT_KNOW = "Δεν ξέρω";

function DontKnowLabel() {
  return (
    <>
      <span lang="el">{DONT_KNOW}</span> <span className="tiny">· Don't know</span>
    </>
  );
}

function Feedback({ score, text, extra, dontKnow }: { score: number; text: string; extra?: string; dontKnow?: boolean }) {
  const cls = dontKnow ? "part" : score >= 1 ? "good" : score > 0 ? "part" : "bad";
  const label = dontKnow ? "Here is the answer" : score >= 1 ? "Correct" : score > 0 ? "Almost" : "Not quite";
  return (
    <div className={`feedback ${cls}`} role="status">
      <strong>{label}.</strong> {extra && <span>{extra} </span>}
      {text && <span className="small">{text}</span>}
    </div>
  );
}

function ChoiceTask({ task, onDone }: { task: Task; onDone: (r: TaskResult) => void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const dontKnow = chosen === -1;
  const grade = chosen !== null ? (dontKnow ? { score: 0 } : gradeChoice(task, chosen)) : null;
  return (
    <>
      <div role="group" aria-label="Options">
        {task.options.map((o, i) => {
          let cls = "option";
          if (checked && i === task.correct_index) cls += " correct";
          else if (checked && i === chosen) cls += " wrong";
          return (
            <button key={i} className={cls} lang="el" aria-pressed={chosen === i} disabled={checked} onClick={() => setChosen(i)}>
              {o}
            </button>
          );
        })}
        <button className="option dontknow" aria-pressed={dontKnow} disabled={checked} onClick={() => setChosen(-1)}>
          <DontKnowLabel />
        </button>
      </div>
      {!checked ? (
        <button className="btn primary block" disabled={chosen === null} onClick={() => setChecked(true)}>
          Check
        </button>
      ) : (
        <>
          <Feedback
            score={grade!.score}
            dontKnow={dontKnow}
            extra={dontKnow ? `Answer: ${task.options[task.correct_index]}.` : undefined}
            text={task.explanation}
          />
          <button
            className="btn primary block"
            style={{ marginTop: 10 }}
            onClick={() =>
              onDone({
                taskId: task.id,
                type: task.type,
                skill: task.skill,
                score: grade!.score,
                userAnswer: dontKnow ? DONT_KNOW : task.options[chosen!],
                dontKnow,
              })
            }
          >
            Next
          </button>
        </>
      )}
    </>
  );
}

function GapTask({ task, onDone }: { task: Task; onDone: (r: TaskResult) => void }) {
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [dontKnow, setDontKnow] = useState(false);
  const grade = dontKnow ? { score: 0, feedback: undefined } : gradeGap(task, answer);
  return (
    <>
      <label className="field">
        <span>Your answer (Greek)</span>
        <input
          type="text"
          lang="el"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={answer}
          disabled={checked}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && answer.trim() && !checked) setChecked(true);
          }}
        />
      </label>
      {!checked ? (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button className="btn primary" style={{ flex: 1 }} disabled={!answer.trim()} onClick={() => setChecked(true)}>
            Check
          </button>
          <button
            className="btn"
            onClick={() => {
              setDontKnow(true);
              setChecked(true);
            }}
          >
            <DontKnowLabel />
          </button>
        </div>
      ) : (
        <>
          <Feedback
            score={grade.score}
            dontKnow={dontKnow}
            extra={grade.score < 1 ? grade.feedback ?? `Answer: ${task.accepted_answers[0]}` : undefined}
            text={task.explanation}
          />
          <button
            className="btn primary block"
            style={{ marginTop: 10 }}
            onClick={() =>
              onDone({
                taskId: task.id,
                type: task.type,
                skill: task.skill,
                score: grade.score,
                userAnswer: dontKnow ? DONT_KNOW : answer.trim(),
                dontKnow,
                feedback: grade.feedback,
              })
            }
          >
            Next
          </button>
        </>
      )}
    </>
  );
}

function MatchTask({ task, onDone }: { task: Task; onDone: (r: TaskResult) => void }) {
  const englishOptions = useMemo(() => shuffle(task.pairs.map((p) => p.english)), [task]);
  const [matches, setMatches] = useState<(string | null)[]>(() => task.pairs.map(() => null));
  const [checked, setChecked] = useState(false);
  const grade = gradeMatch(task.pairs, matches);
  const complete = matches.every((m) => m !== null);
  return (
    <>
      {task.pairs.map((p, i) => {
        const ok = matches[i] === p.english;
        return (
          <div className="match-row" key={i}>
            <span className="g" lang="el">
              {p.greek}
            </span>
            <select
              aria-label={`Meaning of ${p.greek}`}
              value={matches[i] ?? ""}
              disabled={checked}
              onChange={(e) => {
                const v = e.target.value || null;
                setMatches((m) => m.map((x, j) => (j === i ? v : x)));
              }}
              style={checked ? { borderColor: ok ? "var(--good)" : "var(--bad)" } : undefined}
            >
              <option value="">Choose…</option>
              {englishOptions.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
              <option value={DONT_KNOW}>{DONT_KNOW} · Don't know</option>
            </select>
            {checked && !ok && (
              <span className="tiny" style={{ gridColumn: "2" }}>
                → {p.english}
              </span>
            )}
          </div>
        );
      })}
      {!checked ? (
        <button className="btn primary block" disabled={!complete} onClick={() => setChecked(true)}>
          Check
        </button>
      ) : (
        <>
          <Feedback
            score={grade.score}
            dontKnow={matches.every((m) => m === DONT_KNOW)}
            extra={`${Math.round(grade.score * task.pairs.length)} of ${task.pairs.length} right.`}
            text={task.explanation}
          />
          <button
            className="btn primary block"
            style={{ marginTop: 10 }}
            onClick={() =>
              onDone({
                taskId: task.id,
                type: task.type,
                skill: task.skill,
                score: grade.score,
                userAnswer: task.pairs.map((p, i) => `${p.greek} → ${matches[i] ?? "–"}`).join("; "),
                dontKnow: matches.every((m) => m === DONT_KNOW),
              })
            }
          >
            Next
          </button>
        </>
      )}
    </>
  );
}

function WritingTask({ task, onDone }: { task: Task; onDone: (r: TaskResult) => void }) {
  const [text, setText] = useState("");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <>
      {task.long && (
        <p className="small" style={{ marginTop: 0 }}>
          <span className="pill">Longer answer</span>{" "}
          <span className="muted">This one counts double for your writing estimate.</span>
        </p>
      )}
      <label className="field">
        <span>Your answer in Greek · {words} words</span>
        <textarea lang="el" rows={task.long ? 10 : 5} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="tiny">Graded by AI at the end, with corrections.</p>
      <button
        className="btn primary block"
        onClick={() => onDone({ taskId: task.id, type: task.type, skill: task.skill, score: 0, userAnswer: text.trim() })}
      >
        {text.trim() ? "Save answer" : "Skip"}
      </button>
    </>
  );
}
