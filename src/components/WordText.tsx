import { useEffect, useRef, useState } from "react";
import { useApp } from "../App";
import type { GlossEntry, Lesson } from "../lib/types";
import { GLOSS_EVENT, addGloss, findGloss, getGlosses, recordLookup, sentenceAround, tokenize } from "../lib/glosses";
import { describeError, lookupWord } from "../lib/claude";
import { greekVoices, ttsSupported } from "../lib/tts";
import { Icon } from "./Icon";

interface Selected {
  key: string;
  word: string;
  sentence: string;
  gloss: GlossEntry | null;
  loading: boolean;
  error: string | null;
}

/**
 * Lesson text in which every word can be tapped to show its translation in
 * context. Glosses come from the lesson's prepared glosses; a missing word is
 * looked up on demand and remembered.
 */
export function WordText({ lesson, onCost }: { lesson: Lesson; onCost?: (usd: number) => void }) {
  const { apiKey, settings } = useApp();
  const [entries, setEntries] = useState<GlossEntry[]>(() => getGlosses(lesson.id)?.entries ?? []);
  const [sel, setSel] = useState<Selected | null>(null);
  const reqId = useRef(0);
  const multi = lesson.segments.some((s) => s.speaker);

  useEffect(() => {
    const reload = (e: Event) => {
      if ((e as CustomEvent).detail === lesson.id) setEntries(getGlosses(lesson.id)?.entries ?? []);
    };
    window.addEventListener(GLOSS_EVENT, reload);
    return () => window.removeEventListener(GLOSS_EVENT, reload);
  }, [lesson.id]);

  // Close the sheet with Escape.
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const show = (g: GlossEntry) => {
    recordLookup(lesson.id, g);
    return g;
  };

  const tap = async (key: string, word: string, sentence: string) => {
    if (sel?.key === key) return setSel(null);
    const id = ++reqId.current;
    const known = findGloss(entries, word);
    if (known) return setSel({ key, word, sentence, gloss: show(known), loading: false, error: null });
    setSel({ key, word, sentence, gloss: null, loading: true, error: null });
    if (!apiKey) {
      return setSel({ key, word, sentence, gloss: null, loading: false, error: "Add your API key to look up words." });
    }
    try {
      // Not glossed yet: look this one word up now (fast) rather than waiting for the whole lesson.
      const r = await lookupWord(apiKey, settings, word, sentence);
      onCost?.(r.cost.usd);
      addGloss(lesson.id, r.entry);
      if (id === reqId.current) setSel({ key, word, sentence, gloss: show(r.entry), loading: false, error: null });
    } catch (e) {
      if (id === reqId.current) setSel({ key, word, sentence, gloss: null, loading: false, error: describeError(e) });
    }
  };

  const speak = (text: string) => {
    if (!ttsSupported()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = greekVoices();
    const v = voices.find((x) => x.voiceURI === settings.voiceURI) ?? voices[0];
    if (v) u.voice = v;
    u.lang = v?.lang ?? "el-GR";
    u.rate = Math.min(settings.speechRate, 0.9);
    speechSynthesis.speak(u);
  };

  return (
    <>
      <p className="tap-hint">Tap any word for its translation.</p>
      <div className="reading" lang="el">
        {lesson.segments.map((s, i) => {
          let pos = 0;
          return (
            <p key={i}>
              {multi && s.speaker && <span className="speaker">{s.speaker}</span>}
              {tokenize(s.text).map((t, j) => {
                const start = pos;
                pos += t.text.length;
                if (!t.word) return <span key={j}>{t.text}</span>;
                const key = `${i}:${j}`;
                return (
                  <button
                    key={j}
                    type="button"
                    className={`w${sel?.key === key ? " sel" : ""}`}
                    onClick={() => void tap(key, t.text, sentenceAround(s.text, start))}
                  >
                    {t.text}
                  </button>
                );
              })}
            </p>
          );
        })}
      </div>
      {sel && <div style={{ height: 150 }} aria-hidden="true" />}
      {sel && (
        <div className="sheet" role="dialog" aria-label={`Translation of ${sel.word}`}>
          <div className="sheet-inner">
            <div className="row spread" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="form" lang="el">
                  {sel.word}
                </div>
                {sel.loading && (
                  <div className="row small muted" style={{ marginTop: 6 }}>
                    <div className="spinner" style={{ width: 18, height: 18 }} /> Looking it up…
                  </div>
                )}
                {sel.error && (
                  <div className="small" style={{ color: "var(--bad)", marginTop: 4 }}>
                    {sel.error}
                  </div>
                )}
                {sel.gloss && (
                  <>
                    {sel.gloss.lemma && sel.gloss.lemma !== sel.word && (
                      <div className="lemma" lang="el">
                        {sel.gloss.lemma}
                      </div>
                    )}
                    <div className="en">{sel.gloss.en}</div>
                    {sel.gloss.note && <div className="tiny">{sel.gloss.note}</div>}
                  </>
                )}
              </div>
              <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                {ttsSupported() && (
                  <button className="btn ghost" onClick={() => speak(sel.word)} aria-label={`Hear ${sel.word}`}>
                    <Icon name="speaker" />
                  </button>
                )}
                <button className="btn ghost" onClick={() => setSel(null)} aria-label="Close">
                  <Icon name="close" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
