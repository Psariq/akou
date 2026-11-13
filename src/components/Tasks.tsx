import { useMemo, useState } from "react";
import type { Task, TaskResult } from "../lib/types";
import { gradeChoice, gradeGap, gradeMatch, shuffle } from "../lib/grading";

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

export function TaskCard({ task, index, total, onDone }: Props) {
  const [showEn, setShowEn] = useState(false);
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

function Feedback({ score, text, extra }: { score: number; text: string; extra?: string }) {
  const cls = score >= 1 ? "good" : score > 0 ? "part" : "bad";
  const label = score >= 1 ? "Correct" : score > 0 ? "Almost" : "Not quite";
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
  const grade = chosen !== null ? gradeChoice(task, chosen) : null;
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
      </div>
      {!checked ? (
        <button className="btn primary block" disabled={chosen === null} onClick={() => setChecked(true)}>
          Check
        </button>
      ) : (
        <>
          <Feedback score={grade!.score} text={task.explanation} />
          <button
            className="btn primary block"
            style={{ marginTop: 10 }}
            onClick={() =>
              onDone({ taskId: task.id, type: task.type, skill: task.skill, score: grade!.score, userAnswer: task.options[chosen!] })
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
  const grade = gradeGap(task, answer);
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
        <button className="btn primary block" disabled={!answer.trim()} onClick={() => setChecked(true)}>
          Check
        </button>
      ) : (
        <>
          <Feedback
            score={grade.score}
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
                userAnswer: answer.trim(),
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
          <Feedback score={grade.score} extra={`${Math.round(grade.score * task.pairs.length)} of ${task.pairs.length} right.`} text={task.explanation} />
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
      <label className="field">
        <span>Your answer in Greek · {words} words</span>
        <textarea lang="el" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
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
