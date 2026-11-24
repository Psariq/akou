import { useApp } from "../App";

export function Guide() {
  const { navigate } = useApp();
  return (
    <div className="guide">
      <header className="topbar">
        <h1 style={{ margin: 0 }}>Setup guide</h1>
        <button className="btn ghost" onClick={() => navigate("settings")}>
          Settings
        </button>
      </header>

      <section className="card">
        <h2>1. A capped API key (≈5 minutes)</h2>
        <p className="small muted">
          The key stays on this device. To keep any possible misuse cheap, give it its own workspace with a monthly
          spend limit.
        </p>
        <ol className="small">
          <li>
            Sign in to the Claude Console at{" "}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>{" "}
            and add credit under Billing. API use is billed separately from a Claude.ai subscription.
          </li>
          <li>
            Create a workspace just for this app (e.g. “Akou”) on the <strong>Workspaces</strong> page.
          </li>
          <li>
            Select that workspace and click <strong>Spend limits</strong>. Set a monthly cap you're comfortable losing in
            the worst case (e.g. $5–10) and an alert.
          </li>
          <li>
            On the <strong>API keys</strong> page, create a key <strong>in that workspace</strong>. Workspace-scoped keys
            can only access that workspace.
          </li>
          <li>
            Paste the key into <em>Settings → Anthropic API key</em> and tap <em>Test & save</em>. Optionally protect it
            with a passphrase.
          </li>
          <li>
            If you ever suspect the key leaked (lost phone, odd charges): <strong>Disable</strong> or delete it on the API
            keys page, then create a new one.
          </li>
        </ol>
        <p className="tiny">
          Source:{" "}
          <a href="https://platform.claude.com/docs/en/manage-claude/workspaces" target="_blank" rel="noopener noreferrer">
            Anthropic docs: Workspaces
          </a>
          ,{" "}
          <a href="https://platform.claude.com/docs/en/manage-claude/authentication" target="_blank" rel="noopener noreferrer">
            Authentication
          </a>
          . Console menus can change; the docs are authoritative.
        </p>
      </section>

      <section className="card">
        <h2>2. Install the app on your phone</h2>
        <ul className="small">
          <li>
            <strong>iPhone (Safari):</strong> Share button → <em>Add to Home Screen</em>.
          </li>
          <li>
            <strong>Android (Chrome):</strong> ⋮ menu → <em>Install app</em> or <em>Add to Home screen</em>.
          </li>
        </ul>
      </section>

      <section className="card" id="voice">
        <h2>3. Greek voice</h2>
        <p className="small muted">
          Graded listening lessons use original Greek radio and TV recordings from the Centre for the Greek Language
          where one is left at your level (these need an internet connection to play). All other listening uses your
          device's built-in text-to-speech. If <em>Settings → Greek voice</em> finds no voice, install one (menu names
          vary by device and OS version):
        </p>
        <ul className="small">
          <li>
            <strong>iPhone/iPad:</strong> Settings → Accessibility → Spoken Content → Voices → Greek → download a voice.
          </li>
          <li>
            <strong>Android:</strong> Settings → search for “Text-to-speech” → preferred engine (e.g. Speech Services by
            Google) → settings → Install voice data → Greek.
          </li>
          <li>
            <strong>Mac:</strong> System Settings → Accessibility → Spoken Content → System voice → Manage Voices → Greek.
          </li>
          <li>
            <strong>Windows:</strong> Settings → Time & language → Speech → Add voices → Greek.
          </li>
        </ul>
        <p className="small">Then fully close and reopen the app/browser.</p>
      </section>

      <section className="card">
        <h2>4. What a session costs</h2>
        <p className="small">
          The 24 built-in starter lessons are free. New lessons are generated in the background (one or two API calls
          each) when fewer than 2 are left at your level, up to 12 per day at most; grading your written answer is one more
          call per session. The results screen shows an estimated cost per session and the Progress screen a monthly
          total. Your workspace spend limit is the hard cap.
        </p>
      </section>

      <section className="card soft small">
        <h3>How your key is protected</h3>
        <ul>
          <li>It's stored only in this browser (optionally encrypted with your passphrase) and sent only to api.anthropic.com.</li>
          <li>The app loads no third-party scripts, and a Content Security Policy blocks connections to any host except Anthropic and Wikipedia.</li>
          <li>Texts from the web are shown as plain text, never as HTML, and the key is never part of any prompt.</li>
          <li>Backups exclude the key.</li>
        </ul>
      </section>
    </div>
  );
}
