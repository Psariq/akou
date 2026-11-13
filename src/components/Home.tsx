import { useState } from "react";
import { useApp } from "../App";
import type { Mode, SourceKind } from "../lib/types";
import { confidenceLabel, describeTheta, targetFor } from "../lib/cefr";
import { enabledSources } from "../lib/sources";
import { streakDays } from "../lib/stats";
import { Icon } from "./Icon";

const SOURCE_LABEL: Record<SourceKind | "mixed", string> = {
  mixed: "Mixed",
  textbank: "Graded",
  wikipedia: "Wiki",
  news: "News",
  ai: "Everyday",
};

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

  const overall = (progress.reading.theta + progress.listening.theta) / 2;
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
        <p className="tiny" style={{ margin: 0 }}>
          An estimate from your results on level-tagged texts, not a certificate. Covers reading and listening only.
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
          {refill.running
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
