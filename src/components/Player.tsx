import { useEffect, useRef, useState } from "react";
import type { Segment } from "../lib/types";
import { GreekPlayer, loadGreekVoices, ttsSupported } from "../lib/tts";
import { Icon } from "./Icon";

interface Props {
  segments: Segment[];
  /** Original recording: played instead of text-to-speech. */
  audioUrl?: string;
  voiceURI: string;
  rate: number;
  onRateChange?: (r: number) => void;
  /** Called when playback starts from the beginning (counts as one listen). */
  onListen?: () => void;
  onFinished?: () => void;
  compact?: boolean;
}

const RATES = [0.7, 0.8, 0.9, 1.0];

export function Player(props: Props) {
  return props.audioUrl ? <RecordingPlayer {...props} audioUrl={props.audioUrl} /> : <SpeechPlayer {...props} />;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Plays an original recording (streamed from the Centre for the Greek Language's site).
 * It starts at natural speed (not the text-to-speech speed); speed buttons are shown
 * only where the caller allows changing the speed, and the choice isn't saved.
 */
function RecordingPlayer({ audioUrl, onRateChange, onListen, onFinished, compact }: Props & { audioUrl: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cbs = useRef({ onListen, onFinished });
  cbs.current = { onListen, onFinished };

  useEffect(() => {
    if (audio.current) {
      audio.current.defaultPlaybackRate = rate;
      audio.current.playbackRate = rate;
    }
  }, [rate]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    setError(null);
    if (!a.paused) {
      a.pause();
      return;
    }
    if (a.currentTime === 0 || a.ended) cbs.current.onListen?.();
    a.playbackRate = rate;
    a.play().catch(() => setError("Couldn't play the recording. Check your connection and try again."));
  };

  return (
    <div className="player">
      <audio
        ref={audio}
        src={audioUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          e.currentTarget.playbackRate = rate;
        }}
        onEnded={(e) => {
          setPlaying(false);
          e.currentTarget.currentTime = 0;
          setTime(0);
          cbs.current.onFinished?.();
        }}
        onError={() => {
          setPlaying(false);
          setError("Couldn't load the recording from greek-language.gr. Check your connection and try again.");
        }}
      />
      {!compact && <p className="small muted" style={{ margin: 0 }}>Original recording · {duration ? mmss(duration) : "…"}</p>}
      <div className="bar" role="progressbar" aria-label={`${mmss(time)} of ${mmss(duration)}`} aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)}>
        <i style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />
      </div>
      <div className="controls">
        <button
          className="btn"
          onClick={() => {
            if (audio.current) audio.current.currentTime = Math.max(0, audio.current.currentTime - 5);
          }}
          aria-label="Back 5 seconds"
        >
          <Icon name="back" />
        </button>
        <button className={`btn primary ${compact ? "" : "play"}`} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <button
          className="btn"
          onClick={() => {
            const a = audio.current;
            if (!a) return;
            a.pause();
            a.currentTime = 0;
            setTime(0);
          }}
          aria-label="Stop and rewind"
        >
          <Icon name="stop" />
        </button>
      </div>
      {onRateChange && (
        <div className="seg" role="group" aria-label="Speed">
          {RATES.map((r) => (
            <button key={r} aria-pressed={Math.abs(rate - r) < 0.01} onClick={() => setRate(r)}>
              {r.toFixed(1)}×
            </button>
          ))}
        </div>
      )}
      {error && <div className="small" style={{ color: "var(--bad)" }}>{error}</div>}
    </div>
  );
}

/** Reads the text aloud with the device's Greek text-to-speech voice. */
function SpeechPlayer({ segments, voiceURI, rate, onRateChange, onListen, onFinished, compact }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<GreekPlayer | null>(null);
  const cbs = useRef({ onListen, onFinished });
  cbs.current = { onListen, onFinished };

  useEffect(() => {
    let alive = true;
    loadGreekVoices().then((v) => alive && setVoices(v));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (voices === null) return;
    const p = new GreekPlayer(segments, voices, voiceURI, rate, {
      onProgress: (i) => setPos(i),
      onEnd: () => {
        setPlaying(false);
        setPos(0);
        cbs.current.onFinished?.();
      },
      onError: (m) => {
        setPlaying(false);
        setError(m);
      },
    });
    player.current = p;
    return () => p.dispose();
    // Rate changes are applied via setRate below, not by rebuilding the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, voices, voiceURI]);

  useEffect(() => {
    player.current?.setRate(rate);
  }, [rate]);

  if (!ttsSupported()) {
    return <div className="card bad small">This browser can't do speech synthesis, so listening sessions won't work here.</div>;
  }
  if (voices === null) {
    return (
      <div className="row small muted">
        <div className="spinner" /> Loading voices…
      </div>
    );
  }

  const total = player.current?.total ?? 1;
  const toggle = () => {
    const p = player.current;
    if (!p) return;
    setError(null);
    if (p.isPlaying) {
      p.pause();
      setPlaying(false);
    } else {
      if (p.position === 0) cbs.current.onListen?.();
      p.play();
      setPlaying(true);
    }
  };

  return (
    <div className="player">
      {voices.length === 0 && (
        <div className="card warn small" style={{ marginBottom: 0 }}>
          No Greek voice found on this device, so the audio may be read with the wrong pronunciation or not at all. See the setup guide
          (“Greek voice”) for how to install one.
        </div>
      )}
      <div className="bar" aria-label={`Sentence ${Math.min(pos + 1, total)} of ${total}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={pos}>
        <i style={{ width: `${(pos / Math.max(1, total)) * 100}%` }} />
      </div>
      <div className="controls">
        <button className="btn" onClick={() => player.current?.back()} aria-label="Back one sentence">
          <Icon name="back" />
        </button>
        <button className={`btn primary ${compact ? "" : "play"}`} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <button
          className="btn"
          onClick={() => {
            player.current?.stop();
            setPlaying(false);
          }}
          aria-label="Stop and rewind"
        >
          <Icon name="stop" />
        </button>
      </div>
      {onRateChange && (
        <div className="seg" role="group" aria-label="Speed">
          {RATES.map((r) => (
            <button key={r} aria-pressed={Math.abs(rate - r) < 0.01} onClick={() => onRateChange(r)}>
              {r.toFixed(1)}×
            </button>
          ))}
        </div>
      )}
      {error && <div className="small" style={{ color: "var(--bad)" }}>{error}</div>}
    </div>
  );
}
