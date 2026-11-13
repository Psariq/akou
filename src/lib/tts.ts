import type { Segment } from "./types";

/**
 * Greek text-to-speech with the browser's built-in voices (Web Speech API).
 * Quality and availability depend on the device: iOS/macOS and Android usually
 * offer a Greek voice; desktop Linux often doesn't.
 *
 * Text is spoken sentence by sentence. That avoids engines that cut long
 * utterances off, and makes pause/resume reliable (we cancel and restart at
 * the current sentence instead of relying on speechSynthesis.pause()).
 */

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function greekVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith("el"));
}

/** Voices load asynchronously in some browsers. */
export function loadGreekVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve([]);
    const now = greekVoices();
    if (now.length) return resolve(now);
    const done = () => {
      speechSynthesis.removeEventListener("voiceschanged", done);
      clearTimeout(timer);
      resolve(greekVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    speechSynthesis.addEventListener("voiceschanged", done);
  });
}

export function splitSentences(text: string): string[] {
  // Greek question mark is ";" (U+037E or plain semicolon).
  return text
    .split(/(?<=[.!;;?…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface Utt {
  text: string;
  speaker: string;
  segment: number;
}

export function buildQueue(segments: Segment[]): Utt[] {
  const out: Utt[] = [];
  segments.forEach((seg, i) => {
    for (const s of splitSentences(seg.text)) out.push({ text: s, speaker: seg.speaker, segment: i });
  });
  return out;
}

export interface PlayerCallbacks {
  onProgress?: (index: number, total: number) => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}

export class GreekPlayer {
  private queue: Utt[];
  private index = 0;
  private playing = false;
  private token = 0;
  /** Keep a reference to the utterance being spoken (some engines drop events if it is garbage-collected). */
  current: SpeechSynthesisUtterance | null = null;
  private speakerVoice = new Map<string, { voice: SpeechSynthesisVoice | null; pitch: number }>();

  constructor(
    segments: Segment[],
    private voices: SpeechSynthesisVoice[],
    private preferredURI: string,
    private rate: number,
    private cb: PlayerCallbacks = {},
  ) {
    this.queue = buildQueue(segments);
    this.assignVoices();
  }

  private assignVoices() {
    const speakers = [...new Set(this.queue.map((u) => u.speaker))];
    const preferred = this.voices.find((v) => v.voiceURI === this.preferredURI) ?? null;
    const ordered = preferred ? [preferred, ...this.voices.filter((v) => v !== preferred)] : this.voices;
    speakers.forEach((sp, i) => {
      const voice = ordered.length ? ordered[i % ordered.length] : null;
      // With only one Greek voice, vary the pitch so two speakers sound different.
      const pitch = ordered.length > i ? 1 : i % 2 === 0 ? 1 : 0.8;
      this.speakerVoice.set(sp, { voice, pitch });
    });
  }

  get total(): number {
    return this.queue.length;
  }
  get position(): number {
    return this.index;
  }
  get isPlaying(): boolean {
    return this.playing;
  }

  setRate(rate: number) {
    this.rate = rate;
    if (this.playing) {
      this.stopSpeech();
      this.playing = true;
      this.speakCurrent();
    }
  }

  play(from?: number) {
    if (!ttsSupported()) {
      this.cb.onError?.("This browser has no speech synthesis.");
      return;
    }
    if (from !== undefined) this.index = Math.max(0, Math.min(from, this.queue.length - 1));
    if (this.index >= this.queue.length) this.index = 0;
    this.stopSpeech();
    this.playing = true;
    this.speakCurrent();
  }

  pause() {
    this.playing = false;
    this.stopSpeech();
  }

  stop() {
    this.pause();
    this.index = 0;
    this.cb.onProgress?.(0, this.queue.length);
  }

  /** Jump back one sentence (or to the start of the current one). */
  back() {
    const wasPlaying = this.playing;
    this.stopSpeech();
    this.index = Math.max(0, this.index - 1);
    this.cb.onProgress?.(this.index, this.queue.length);
    if (wasPlaying) {
      this.playing = true;
      this.speakCurrent();
    }
  }

  private stopSpeech() {
    this.token++;
    try {
      speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }

  private speakCurrent() {
    const item = this.queue[this.index];
    if (!item) {
      this.playing = false;
      this.index = 0;
      this.cb.onEnd?.();
      return;
    }
    const myToken = ++this.token;
    const u = new SpeechSynthesisUtterance(item.text);
    const sv = this.speakerVoice.get(item.speaker);
    if (sv?.voice) u.voice = sv.voice;
    u.lang = sv?.voice?.lang ?? "el-GR";
    u.pitch = sv?.pitch ?? 1;
    u.rate = this.rate;
    u.onend = () => {
      if (myToken !== this.token || !this.playing) return;
      this.index++;
      this.cb.onProgress?.(this.index, this.queue.length);
      this.speakCurrent();
    };
    u.onerror = (ev) => {
      if (myToken !== this.token) return;
      // "interrupted"/"canceled" are caused by our own cancel() calls.
      if (ev.error === "interrupted" || ev.error === "canceled") return;
      this.playing = false;
      this.cb.onError?.(`Speech error: ${ev.error}`);
    };
    this.current = u;
    this.cb.onProgress?.(this.index, this.queue.length);
    speechSynthesis.speak(u);
  }

  dispose() {
    this.pause();
    this.current = null;
  }
}
