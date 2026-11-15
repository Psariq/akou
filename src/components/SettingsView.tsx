import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import type { Cefr, ModelId, SourceKind } from "../lib/types";
import { MODEL_INFO } from "../lib/pricing";
import { START_LEVELS, describeTheta, setEstimate } from "../lib/cefr";
import { DEFAULT_NEWS_DOMAINS, exportBackup, importBackup, initialProgress, resetProgress, saveProgress } from "../lib/storage";
import { describeError, testKey } from "../lib/claude";
import { loadGreekVoices, ttsSupported } from "../lib/tts";

export function SettingsView() {
  const app = useApp();
  const { settings, updateSettings, keyState, keyEncrypted, navigate, sessions } = app;

  return (
    <>
      <header className="topbar">
        <h1 style={{ margin: 0 }}>Settings</h1>
        <button className="btn ghost" onClick={() => navigate("guide")}>
          Setup guide
        </button>
      </header>

      <KeySection />

      <section className="card">
        <h2>AI model</h2>
        <label className="field">
          <span>Model for texts, questions and grading</span>
          <select value={settings.model} onChange={(e) => updateSettings({ model: e.target.value as ModelId })}>
            {(Object.keys(MODEL_INFO) as ModelId[]).map((m) => (
              <option key={m} value={m}>
                {MODEL_INFO[m].label} – ${MODEL_INFO[m].input}/${MODEL_INFO[m].output} per M tokens
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Explanations and feedback in</span>
          <select
            value={settings.explanationLang}
            onChange={(e) => updateSettings({ explanationLang: e.target.value as "en" | "el" })}
          >
            <option value="en">English</option>
            <option value="el">Greek (simple)</option>
          </select>
        </label>
      </section>

      <section className="card">
        <h2>Texts</h2>
        {(
          [
            ["textbank", "Graded texts from the Centre for the Greek Language's text bank (A1–C2, written or adapted for learners; fetched on demand for personal study)"],
            ["wikipedia", "Greek Wikipedia articles (CC BY-SA 4.0), simplified to your level"],
            ["ai", "Everyday texts and dialogues written by AI"],
            ["news", "Current news articles, only when you pick “News” (not used for background lessons)"],
          ] as [SourceKind, string][]
        ).map(([k, label]) => (
          <label className="check" key={k}>
            <input
              type="checkbox"
              checked={settings.sources[k]}
              onChange={(e) => updateSettings({ sources: { ...settings.sources, [k]: e.target.checked } })}
            />
            <span>{label}</span>
          </label>
        ))}
        <label className="field" style={{ marginTop: 12 }}>
          <span>Your interests (comma-separated, optional; used to pick topics)</span>
          <input
            type="text"
            placeholder="e.g. history, cooking, football, islands"
            value={settings.interests}
            onChange={(e) => updateSettings({ interests: e.target.value })}
          />
        </label>
        <DomainsField />
      </section>

      <section className="card">
        <h2>Level</h2>
        {sessions.length > 0 && <SetLevel />}
        <label className="field" style={sessions.length > 0 ? { display: "none" } : undefined}>
          <span>Starting point (self-assessment)</span>
          <select
            value={settings.startLevel}
            onChange={(e) => {
              const v = Number(e.target.value);
              updateSettings({ startLevel: v });
              if (app.progress.reading.n === 0 && app.progress.listening.n === 0) {
                saveProgress(initialProgress(v));
                app.reload();
              }
            }}
          >
            {START_LEVELS.map((l) => (
              <option key={l.label} value={l.theta}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Text difficulty</span>
          <select
            value={settings.levelOverride}
            onChange={(e) => updateSettings({ levelOverride: e.target.value as "auto" | Cefr })}
          >
            <option value="auto">Automatic (slightly above your estimate)</option>
            <option value="A2">Always A2</option>
            <option value="B1">Always B1</option>
            <option value="B2">Always B2</option>
            <option value="C1">Always C1</option>
          </select>
        </label>
        <label className="field">
          <span>Longer written answer (more evidence for your writing level)</span>
          <select
            value={settings.longWritingEvery ?? 4}
            onChange={(e) => updateSettings({ longWritingEvery: Number(e.target.value) })}
          >
            <option value={3}>Every 3rd exercise</option>
            <option value={4}>Every 4th exercise</option>
            <option value={6}>Every 6th exercise</option>
            <option value={0}>Never</option>
          </select>
        </label>
        <p className="tiny" style={{ marginTop: -6 }}>
          At most one per sitting: exercises less than 2 hours apart count as one sitting.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.extraPractice !== false}
            onChange={(e) => updateSettings({ extraPractice: e.target.checked })}
          />
          <span>
            Extra questions for weak areas (grammar, vocabulary, details, inference below 60% in your last 10 answers; up
            to 3 per exercise, not counted in the score)
          </span>
        </label>
      </section>

      <VoiceSection />
      <DataSection />

      <section className="card soft small">
        <h3>Privacy</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          Your progress and settings are stored only in this browser. Texts, questions and your written answers are sent
          to Anthropic's API to generate and grade lessons; Wikipedia articles are loaded from el.wikipedia.org. Nothing
          else is sent anywhere.{" "}
          {keyState === "ready" && keyEncrypted && (
            <button className="btn ghost small" onClick={app.lock}>
              Lock now
            </button>
          )}
        </p>
      </section>
    </>
  );
}

/** Move the level estimate by hand (both skills), keeping the session history. */
function SetLevel() {
  const app = useApp();
  const { progress } = app;
  const [value, setValue] = useState(START_LEVELS[0].theta);
  const [msg, setMsg] = useState<string | null>(null);
  const current = (s: "reading" | "listening") => {
    const d = describeTheta(progress[s].theta);
    return `${d.level} ${Math.round(d.progress * 100)}%`;
  };
  const apply = () => {
    const label = START_LEVELS.find((l) => l.theta === value)?.label ?? "";
    saveProgress({ reading: setEstimate(progress.reading, value), listening: setEstimate(progress.listening, value) });
    app.updateSettings({ startLevel: value });
    app.reload();
    setMsg(`Level set to ${label}. Your next texts will match it, and the estimate adapts again from your results.`);
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <p className="small muted" style={{ marginBottom: 8 }}>
        Current estimate: reading {current("reading")}, listening {current("listening")}. If the texts feel much too hard
        or too easy, set your level here. Your history is kept.
      </p>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <select aria-label="Set my current level" value={value} onChange={(e) => setValue(Number(e.target.value))}>
          {START_LEVELS.map((l) => (
            <option key={l.label} value={l.theta}>
              {l.label}
            </option>
          ))}
        </select>
        <button className="btn" onClick={apply} style={{ flex: "none" }}>
          Set my level
        </button>
      </div>
      {msg && (
        <p className="small" role="status" style={{ marginTop: 8, marginBottom: 0, color: "var(--good)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

function DomainsField() {
  const { settings, updateSettings } = useApp();
  const [text, setText] = useState(settings.newsDomains.join(", "));
  const commit = () => {
    const list = text
      .split(/[\s,]+/)
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
    const next = list.length ? list : DEFAULT_NEWS_DOMAINS;
    updateSettings({ newsDomains: next });
    setText(next.join(", "));
  };
  return (
    <label className="field">
      <span>News sites the AI may search and fetch</span>
      <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} rows={3} />
    </label>
  );
}

function KeySection() {
  const { keyState, keyEncrypted, saveKey, forgetKey, navigate } = useApp();
  const [key, setKey] = useState("");
  const [usePass, setUsePass] = useState(false);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(keyState === "none");

  const k = key.trim();
  const passOk = !usePass || (pass.length >= 6 && pass === pass2);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await testKey(k);
      await saveKey(k, usePass ? pass : undefined);
      setKey("");
      setPass("");
      setPass2("");
      setEditing(false);
      setMsg({ ok: true, text: "Key works and is saved on this device." });
    } catch (e) {
      setMsg({ ok: false, text: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Anthropic API key</h2>
      {keyState !== "none" && !editing ? (
        <>
          <p className="small">
            {keyState === "locked" ? "Saved and locked." : keyEncrypted ? "Saved, protected with a passphrase (unlocked now)." : "Saved on this device (not passphrase-protected)."}
          </p>
          <div className="row">
            <button className="btn" onClick={() => setEditing(true)}>
              Replace key
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (window.confirm("Remove the API key from this device?")) forgetKey();
              }}
            >
              Remove key
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small muted">
            Use a key from a dedicated workspace with a monthly spend limit.{" "}
            <button className="btn ghost small" style={{ padding: 0, minHeight: 0 }} onClick={() => navigate("guide")}>
              How?
            </button>
          </p>
          <label className="field">
            <span>API key</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={usePass} onChange={(e) => setUsePass(e.target.checked)} />
            <span>Protect it with a passphrase (asked each time the app opens)</span>
          </label>
          {usePass && (
            <>
              <label className="field">
                <span>Passphrase (at least 6 characters; longer is safer)</span>
                <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
              </label>
              <label className="field">
                <span>Repeat passphrase</span>
                <input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
              </label>
              <p className="tiny">
                Protects the stored key if someone reads this browser's storage. A short PIN can be guessed by someone who copies
                the storage, so prefer a few words. If you forget it, just enter the key again.
              </p>
            </>
          )}
          <div className="row">
            <button className="btn primary" disabled={busy || !k.startsWith("sk-ant-") || !passOk} onClick={save}>
              {busy ? "Checking…" : "Test & save"}
            </button>
            {keyState !== "none" && (
              <button className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}
      {msg && (
        <p className="small" role="status" style={{ marginTop: 8, marginBottom: 0, color: msg.ok ? "var(--good)" : "var(--bad)" }}>
          {msg.text}
        </p>
      )}
    </section>
  );
}

function VoiceSection() {
  const { settings, updateSettings } = useApp();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);
  useEffect(() => {
    loadGreekVoices().then(setVoices);
  }, []);

  const test = () => {
    if (!ttsSupported()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Καλημέρα! Πώς είσαι σήμερα; Πάμε για καφέ στην πλατεία;");
    const v = voices?.find((x) => x.voiceURI === settings.voiceURI) ?? voices?.[0];
    if (v) u.voice = v;
    u.lang = v?.lang ?? "el-GR";
    u.rate = settings.speechRate;
    speechSynthesis.speak(u);
  };

  return (
    <section className="card">
      <h2>Greek voice</h2>
      {!ttsSupported() ? (
        <p className="small">This browser has no speech synthesis.</p>
      ) : voices === null ? (
        <p className="small muted">Loading voices…</p>
      ) : voices.length === 0 ? (
        <p className="small">
          No Greek voice found on this device. See the setup guide (“Greek voice”) for how to install one, then reload.
        </p>
      ) : (
        <label className="field">
          <span>Voice ({voices.length} Greek voice{voices.length > 1 ? "s" : ""}; dialogues use several if available)</span>
          <select value={settings.voiceURI} onChange={(e) => updateSettings({ voiceURI: e.target.value })}>
            <option value="">Default</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Speed: {settings.speechRate.toFixed(1)}×</span>
        <input
          type="range"
          min={0.6}
          max={1.2}
          step={0.1}
          value={settings.speechRate}
          onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })}
          style={{ width: "100%" }}
        />
      </label>
      <button className="btn" onClick={test} disabled={!ttsSupported()}>
        Test voice
      </button>
    </section>
  );
}

function DataSection() {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `akou-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg("Backup downloaded. It contains your progress and settings, not your API key.");
  };

  const doImport = async (file: File) => {
    try {
      const r = importBackup(JSON.parse(await file.text()));
      if (r.ok) {
        app.reload();
        setMsg("Backup restored.");
      } else setMsg(r.error);
    } catch {
      setMsg("That file couldn't be read.");
    }
  };

  return (
    <section className="card">
      <h2>Your data</h2>
      <p className="small muted">
        Progress is stored only in this browser. Clearing site data deletes it, so export a backup now and then. Backups
        never include your API key.
      </p>
      <div className="row">
        <button className="btn" onClick={doExport}>
          Export backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
            e.target.value = "";
          }}
        />
        <button
          className="btn danger"
          onClick={() => {
            if (window.confirm("Delete all sessions and reset your level estimate? This can't be undone.")) {
              resetProgress();
              app.reload();
              setMsg("Progress reset.");
            }
          }}
        >
          Reset progress
        </button>
      </div>
      {msg && (
        <p className="small" role="status" style={{ marginTop: 8, marginBottom: 0 }}>
          {msg}
        </p>
      )}
    </section>
  );
}
