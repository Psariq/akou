import { useState } from "react";
import { useApp } from "../App";
import type { Mode, SourceKind } from "../lib/types";
import { confidenceLabel, describeTheta, overallTheta, targetFor } from "../lib/cefr";
import { enabledSources } from "../lib/sources";
import { SKILL_LABEL, streakDays } from "../lib/stats";
import { weakSkills } from "../lib/practice";
import { getMonth, isComplete, monthLabel, openMonth, updateMonth } from "../lib/placement";
import { Icon } from "./Icon";

const SOURCE_LABEL: Record<SourceKind | "mixed", string> = {
  mixed: "Mixed",
  textbank: "Graded",
  wikipedia: "Wiki",
  news: "News",
  ai: "Everyday",
};

/** End-of-month placement test: invitation, or a reminder that a result is waiting. */
function PlacementBanner() {
  const { navigate } = useApp();
  const [, force] = useState(0);
  const month = openMonth();
  if (!month) return null;
  const m = getMonth(month);
  const done = isComplete(m);
  if (done && m.applied !== undefined) return null;
  if (!done && m.snoozedUntil && new Date(m.snoozedUntil) > new Date()) return null;
  const started = !!(m.results.reading || m.results.listening);
  return (
    <section className="card good" aria-label="Placement test">
      <h2 style={{ marginBottom: 4 }}>
        {done ? "Your placement result is ready" : `Monthly placement test · ${monthLabel(month)}`}
      </h2>
      <p className="small" style={{ marginBottom: 10 }}>
        {done
          ? "See how you placed and decide whether to apply it."
          : started
            ? "One part is done. The other part is still open."
            : "Reading (+ writing) and listening, about 15–20 minutes each. You can do the parts on different days."}
      </p>
      <div className="row">
        <button className="btn primary" onClick={() => navigate("placement")}>
          {done ? "See result" : started ? "Continue" : "Start"}
        </button>
        {!done && (
          <button
            className="btn"
            onClick={() => {
              updateMonth(month, (x) => ({ ...x, snoozedUntil: new Date(Date.now() + 86_400_000).toISOString() }));
              force((n) => n + 1);
            }}
          >
            Later
          </button>
        )}
      </div>
    </section>
  );
}

/** Which task types currently get extra questions. */
function PracticeLine() {
  const { sessions, settings } = useApp();
  if (settings.extraPractice === false) return null;
  const weak = weakSkills(sessions);
  if (!weak.length) return null;
  return (
    <p className="small" style={{ marginTop: 0 }}>
      <span className="pill">Extra practice</span>{" "}
      {weak.map((w) => `${SKILL_LABEL[w.skill]} (${Math.round(w.pct * 100)}% recently)`).join(", ")}
    </p>
  );
}

/** Writing estimate, or a note that it starts after the first graded written answer. */
export function WritingLine() {
  const { progress } = useApp();
  if (progress.writing && progress.writing.n > 0)
    return <LevelLine label="Writing" theta={progress.writing.theta} n={progress.writing.n} />;
  return (
    <div className="row spread small" style={{ marginBottom: 10 }}>
      <span>
        <strong>Writing</strong> · <span className="muted">no estimate yet</span>
      </span>
      <span className="tiny">after your first graded written answer</span>
    </div>
  );
}

export function LevelLine({ label, theta, n }: { label: string; theta: number; n: number }) {
  const d = describeTheta(theta);
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row spread small">
        <span>
          <strong>{label}</strong> · {d.level}
          {d.next ? <span className="muted"> → {d.next} {Math.round(d.progress * 100)}%</span> : null}
        </span>
        <span className="tiny">{confidenceLabel(n)}</span>
      </div>
      <div className="bar" aria-hidden="true">
        <i style={{ width: `${Math.round(d.progress * 100)}%` }} />
      </div>
    </div>
  );
}

function ReadyLine({ n }: { n: number }) {
  return (
    <span className="tiny" style={{ marginTop: 4 }}>
      {n > 0 ? `${n} lesson${n > 1 ? "s" : ""} ready at your level` : "No lesson ready yet at your level"}
    </span>
  );
}

export function Home() {
  const { settings, progress, sessions, keyState, startSession, navigate, ready: readyN, refill } = useApp();
  const [source, setSource] = useState<SourceKind | "mixed">("mixed");
  const [url, setUrl] = useState("");
  const sources = enabledSources(settings);
  const choices: (SourceKind | "mixed")[] = sources.length > 1 ? ["mixed", ...sources] : sources;
  const effectiveSource = choices.includes(source) ? source : choices[0];

  const overall = overallTheta(progress);
  const od = describeTheta(overall);
  const today = new Date().toDateString();
  const todayCount = sessions.filter((s) => new Date(s.date).toDateString() === today).length;
  const streak = streakDays(sessions);
  const ready = keyState === "ready";

  const go = (mode: Mode) => startSession({ mode, source: effectiveSource });
  const goUrl = (mode: Mode) => {
    const u = url.trim();
    if (!/^https?:\/\/\S+$/.test(u)) return;
    startSession({ mode, source: "news", url: u });
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          Άκου<small>Greek reading & listening</small>
        </div>
      </header>

      {!ready && (
        <div className="card warn">
          <h2>One-time setup</h2>
          <p className="small">
            Άκου uses your own Anthropic API key to create texts and grade answers. Set up a capped key first (about 5 minutes).
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => navigate("guide")}>
              Setup guide
            </button>
            <button className="btn" onClick={() => navigate("settings")}>
              Enter key
            </button>
          </div>
        </div>
      )}

      {ready && <PlacementBanner />}

      <section className="card" aria-label="Estimated level">
        <div className="row spread" style={{ alignItems: "flex-end", marginBottom: 12 }}>
          <div>
            <div className="tiny">Estimated level</div>
            <div className="level-big">{od.level}</div>
          </div>
          <div className="small muted" style={{ textAlign: "right" }}>
            {todayCount > 0 ? `${todayCount} today` : "Nothing yet today"}
            {streak > 1 ? ` · ${streak}-day streak` : ""}
          </div>
        </div>
        <LevelLine label="Reading" theta={progress.reading.theta} n={progress.reading.n} />
        <LevelLine label="Listening" theta={progress.listening.theta} n={progress.listening.n} />
        <WritingLine />
        <PracticeLine />
        <p className="tiny" style={{ margin: 0 }}>
          An estimate, not a certificate. Reading and listening come from your scores on level-tagged texts; writing from the
          AI's judgement of your short written answers (rougher, especially above B1). Speaking isn't covered.
        </p>
      </section>

      {choices.length > 1 && (
        <div className="seg" role="group" aria-label="Text source" style={{ marginBottom: 12 }}>
          {choices.map((c) => (
            <button key={c} aria-pressed={effectiveSource === c} onClick={() => setSource(c)}>
              {SOURCE_LABEL[c]}
            </button>
          ))}
        </div>
      )}

      <div className="stack">
        <button className="mode-btn" onClick={() => go("reading")} disabled={!ready}>
          <span className="row">
            <Icon name="read" />
            <span className="t">Reading</span>
            <span className="pill">{targetFor(progress.reading.theta, settings.levelOverride).level}</span>
          </span>
          <span className="d">≈5 min text, then ≈5 min of questions and tasks</span>
          <ReadyLine n={readyN.reading} />
        </button>
        <button className="mode-btn" onClick={() => go("listening")} disabled={!ready}>
          <span className="row">
            <Icon name="ear" />
            <span className="t">Listening</span>
            <span className="pill">{targetFor(progress.listening.theta, settings.levelOverride).level}</span>
          </span>
          <span className="d">2–3 min audio (replay allowed), then ≈5 min of tasks</span>
          <ReadyLine n={readyN.listening} />
        </button>
      </div>

      {ready && (refill.running || refill.error) && (
        <p className="tiny" role="status" style={{ marginTop: 8 }}>
          {refill.running && refill.placement
            ? `Preparing your placement test (${refill.mode}) in the background…`
            : refill.running && refill.glossing
            ? `Preparing word translations and practice for your next ${refill.mode} lessons in the background…`
            : refill.running
            ? `Preparing a new ${refill.level} ${refill.mode} lesson in the background… Keep the app open; it usually takes a few minutes.`
            : `Couldn't prepare a new lesson: ${refill.error} It will try again later.`}
        </p>
      )}
      {effectiveSource !== "mixed" && (
        <p className="tiny" style={{ marginTop: 8 }}>
          With a specific source, a ready lesson from that source is used if there is one; otherwise one is written on the spot, which can take a few minutes.
        </p>
      )}

      <details className="card soft" style={{ marginTop: 12 }}>
        <summary>Use a specific Greek article (paste a link)</summary>
        <label className="field" style={{ marginTop: 8 }}>
          <span>Article URL</span>
          <input type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn" disabled={!ready || !/^https?:\/\/\S+$/.test(url.trim())} onClick={() => goUrl("reading")}>
            Read it
          </button>
          <button className="btn" disabled={!ready || !/^https?:\/\/\S+$/.test(url.trim())} onClick={() => goUrl("listening")}>
            Listen to it
          </button>
        </div>
        <p className="tiny" style={{ marginTop: 8, marginBottom: 0 }}>
          The article is fetched by Anthropic's servers and adapted to your level. Some sites block this.
        </p>
      </details>
    </>
  );
}
