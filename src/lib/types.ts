export type Mode = "reading" | "listening";
export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1";
export type SourceKind = "textbank" | "wikipedia" | "news" | "ai";
export type TaskType = "multiple_choice" | "true_false" | "gap_fill" | "vocab_match" | "short_answer";
export type TaskSkill = "gist" | "detail" | "inference" | "vocabulary" | "grammar" | "writing";
export type ModelId = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";

export interface VocabPair {
  greek: string;
  english: string;
}

export interface Task {
  id: string;
  type: TaskType;
  skill: TaskSkill;
  /** Instruction / question in Greek. Gap-fill prompts contain "___" once. */
  prompt: string;
  /** English translation of the prompt, shown on demand. */
  prompt_en: string;
  /** Answer options (multiple choice, true/false). Empty otherwise. */
  options: string[];
  /** Index into options; -1 when not applicable. */
  correct_index: number;
  /** Accepted answers for gap-fill. Empty otherwise. */
  accepted_answers: string[];
  /** Word pairs for vocab_match. Empty otherwise. */
  pairs: VocabPair[];
  /** Why the answer is right (shown after answering). For short_answer: a model answer. */
  explanation: string;
}

export interface Segment {
  speaker: string;
  text: string;
}

export interface GlossaryItem {
  greek: string;
  english: string;
  note: string;
}

/** One word form from a lesson text, translated in context. */
export interface GlossEntry {
  /** The form as it appears in the text. */
  form: string;
  /** Dictionary form (with article for nouns). */
  lemma: string;
  /** English meaning in this context. */
  en: string;
  /** Short grammar note, e.g. "aorist, 3rd sg." */
  note: string;
}

export interface SourceInfo {
  kind: SourceKind;
  /** Part of the built-in starter library. */
  starter?: boolean;
  title?: string;
  url?: string;
  publisher?: string;
  license?: string;
}

export interface Lesson {
  /** Stable id, used to avoid repeating a lesson. */
  id: string;
  title: string;
  title_en: string;
  topic: string;
  level: Cefr;
  segments: Segment[];
  glossary: GlossaryItem[];
  tasks: Task[];
  source: SourceInfo;
}

export interface TaskResult {
  taskId: string;
  type: TaskType;
  skill: TaskSkill;
  /** 0..1 */
  score: number;
  userAnswer: string;
  /** The learner chose "Don't know" (scored 0, no guessing). */
  dontKnow?: boolean;
  feedback?: string;
  corrected?: string;
  /** Written answers: CEFR level shown by the writing, as judged by the grader. */
  cefr?: Cefr;
}

export interface SessionRecord {
  id: string;
  /** Lesson.id of the lesson used (absent in sessions from older versions). */
  lessonId?: string;
  date: string; // ISO timestamp
  mode: Mode;
  level: Cefr;
  title: string;
  topic: string;
  source: SourceInfo;
  /** Mean task score, 0..1 */
  score: number;
  taskResults: TaskResult[];
  exposureSec: number;
  tasksSec: number;
  plays?: number;
  thetaBefore: number;
  thetaAfter: number;
  costUsd: number;
  glossary: GlossaryItem[];
  overallComment?: string;
  /** CEFR level the grader judged the written answer to show, if any. */
  writingLevel?: Cefr;
  writingThetaAfter?: number;
}

export interface SkillProgress {
  /** Continuous level estimate: 1 = A1, 2 = A2, 3 = B1, 4 = B2, 5 = C1. */
  theta: number;
  /** Number of sessions that informed the estimate. */
  n: number;
}

export interface Progress {
  reading: SkillProgress;
  listening: SkillProgress;
  /** Writing: running estimate from the AI's CEFR judgement of short written answers (absent until the first one). */
  writing?: SkillProgress;
}

export interface Settings {
  model: ModelId;
  explanationLang: "en" | "el";
  sources: Record<SourceKind, boolean>;
  newsDomains: string[];
  interests: string;
  startLevel: number;
  levelOverride: "auto" | Cefr;
  speechRate: number;
  voiceURI: string;
}

export interface UsageCost {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  usd: number;
}
