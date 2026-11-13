import { useState } from "react";
import { useApp } from "../App";
import { Icon } from "./Icon";

export function Unlock() {
  const { unlock, forgetKey, navigate } = useApp();
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  const submit = async () => {
    setBusy(true);
    setWrong(false);
    const ok = await unlock(pass);
    setBusy(false);
    if (!ok) setWrong(true);
    else setPass("");
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">Άκου</div>
      </header>
      <section className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <Icon name="lock" />
          <h2 style={{ margin: 0 }}>Unlock your API key</h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pass) void submit();
          }}
        >
          <label className="field">
            <span>Passphrase</span>
            <input type="password" autoComplete="current-password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          {wrong && (
            <p className="small" role="alert" style={{ color: "var(--bad)" }}>
              Wrong passphrase.
            </p>
          )}
          <button className="btn primary block" type="submit" disabled={!pass || busy}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>
      </section>
      <div className="row">
        <button
          className="btn ghost"
          onClick={() => {
            if (window.confirm("Forget the stored key? You'll need to enter your API key again. Your progress is kept.")) {
              forgetKey();
              navigate("settings");
            }
          }}
        >
          Forgot passphrase
        </button>
      </div>
    </>
  );
}
