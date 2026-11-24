import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import type { Cefr, GlossEntry, Lesson, Mode, ModelId, Settings, Task, UsageCost } from "./types";
import type { Material } from "./sources";
import type { Target } from "./cefr";
import { MODEL_INFO, addCost, costOf, ZERO_COST } from "./pricing";
import { recordCost, type CostTag } from "./ledger";
import {
  GLOSS_SYSTEM,
  GRADING_SYSTEM,
  LESSON_SYSTEM,
  extraTasksPrompt,
  NEWS_SYSTEM,
  glossPrompt,
  gradingPrompt,
  lessonPrompt,
  lookupPrompt,
  newsPrompt,
  type GradingItem,
} from "./prompts";
import { isUsableTask } from "./grading";
import { checkTranscript } from "./transcript";

/**
 * All Claude API calls. They go straight from this browser to
 * api.anthropic.com with the user's own key (no server in between).
 * The key is only ever sent in the request header to Anthropic - it is never
 * part of any prompt.
 */

export function makeClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    // Required for browser use. Acceptable here because the key belongs to the
    // person using the app, lives only on their device, and the page's Content
    // Security Policy only allows connections to Anthropic and Wikipedia.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });
}

/** Cheap check that a key works (lists models; no tokens are used). */
export async function testKey(apiKey: string): Promise<void> {
  const client = makeClient(apiKey);
  await client.models.list({ limit: 1 });
}

export class LessonError extends Error {}

/** Server-side fallback on refusals (Opus 5.5 / Sonnet 5.5): route by refusal category. */
function fallbackParams(model: ModelId): Record<string, unknown> {
  return MODEL_INFO[model].serverFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {};
}

function checkStop(stop: string | null | undefined): void {
  if (stop === "refusal") throw new LessonError("The model declined this request. Please try again (a different text will be chosen).");
  if (stop === "max_tokens") throw new LessonError("The response was cut off. Please try again.");
}

async function callStructured<T>(
  client: Anthropic,
  model: ModelId,
  opts: {
    system: string;
    user: string;
    schema: object;
    effort: "low" | "medium" | "high";
    tag: CostTag;
    signal?: AbortSignal;
  },
): Promise<{ data: T; cost: UsageCost }> {
  const params = {
    model,
    max_tokens: 16000,
    system: opts.system,
    messages: [{ role: "user" as const, content: opts.user }],
    output_config: {
      effort: opts.effort,
      format: betaJSONSchemaOutputFormat(opts.schema as any),
    },
    ...fallbackParams(model),
  };
  const msg = await client.beta.messages.parse(params as any, { signal: opts.signal });
  // Record before any checks: a refused or cut-off response is still billed.
  const cost = costOf(model, msg.usage as any);
  recordCost(opts.tag, model, cost);
  checkStop(msg.stop_reason);
  const data = msg.parsed_output as T | null;
  if (!data) throw new LessonError("Couldn't read the generated lesson. Please try again.");
  return { data, cost };
}

/* ---------------- News: search + fetch on Anthropic's side ---------------- */

export interface NewsResult {
  material: Material;
  cost: UsageCost;
}

export function parseNewsReply(text: string): Omit<Material, "kind"> | null {
  if (/NOT_FOUND/.test(text) && !/FACTS:/.test(text)) return null;
  const field = (name: string) => text.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, "m"))?.[1]?.trim();
  const factsIdx = text.search(/^\s*FACTS:\s*$/m);
  const facts = factsIdx >= 0 ? text.slice(factsIdx).replace(/^\s*FACTS:\s*/, "").trim() : "";
  if (facts.length < 200) return null;
  const url = field("URL");
  return {
    text: facts,
    title: field("TITLE"),
    url: url && /^https?:\/\//.test(url) ? url : undefined,
    publisher: field("PUBLISHER"),
  };
}

export async function findNews(
  apiKey: string,
  s: Settings,
  opts: { avoidTitles: string[]; interests: string[]; url?: string; signal?: AbortSignal; mode?: Mode },
): Promise<NewsResult> {
  const client = makeClient(apiKey);
  const today = new Date().toISOString().slice(0, 10);
  const domains = s.newsDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);

  const tools: any[] = opts.url
    ? [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 2, max_content_tokens: 12000 }]
    : [
        { type: "web_search_20260209", name: "web_search", max_uses: 2, allowed_domains: domains },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3, allowed_domains: domains, max_content_tokens: 12000 },
      ];

  const messages: any[] = [{ role: "user", content: newsPrompt(s, today, opts.avoidTitles, opts.interests, opts.url) }];
  let cost = ZERO_COST;
  let finalText = "";

  // Server tools may pause a long turn; send it back to let the server continue.
  for (let i = 0; i < 4; i++) {
    const msg = await client.beta.messages.create(
      {
        model: s.model,
        max_tokens: 16000,
        system: NEWS_SYSTEM,
        messages,
        tools,
        output_config: { effort: "low" },
        ...fallbackParams(s.model),
      } as any,
      { signal: opts.signal },
    );
    const stepCost = costOf(s.model, (msg as any).usage);
    recordCost({ job: "news", mode: opts.mode }, s.model, stepCost);
    cost = addCost(cost, stepCost);
    const text = (msg as any).content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    finalText += text;
    if ((msg as any).stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: (msg as any).content });
      continue;
    }
    checkStop((msg as any).stop_reason);
    break;
  }

  const parsed = parseNewsReply(finalText);
  if (!parsed) {
    const reason = finalText.match(/NOT_FOUND:\s*(.+)/)?.[1]?.trim();
    throw new LessonError(`Couldn't get a news article${reason ? `: ${reason}` : ""}.`);
  }
  return { material: { kind: "news", ...parsed }, cost };
}

/* ---------------- Lesson generation ---------------- */

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;

export const LESSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "title_en", "topic", "level", "segments", "glossary", "tasks"],
  properties: {
    title: str,
    title_en: str,
    topic: str,
    level: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1"] },
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["speaker", "text"],
        properties: { speaker: str, text: str },
      },
    },
    glossary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["greek", "english", "note"],
        properties: { greek: str, english: str, note: str },
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "skill", "prompt", "prompt_en", "options", "correct_index", "accepted_answers", "pairs", "explanation"],
        properties: {
          type: { type: "string", enum: ["multiple_choice", "true_false", "gap_fill", "vocab_match", "short_answer"] },
          skill: { type: "string", enum: ["gist", "detail", "inference", "vocabulary", "grammar", "writing"] },
          prompt: str,
          prompt_en: str,
          options: strArr,
          correct_index: { type: "integer" },
          accepted_answers: strArr,
          pairs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["greek", "english"],
              properties: { greek: str, english: str },
            },
          },
          explanation: str,
        },
      },
    },
  },
} as const;

type GeneratedLesson = Omit<Lesson, "source" | "tasks" | "id"> & { tasks: Omit<Task, "id">[] };

function finishLesson(data: GeneratedLesson, target: Target, material: Material): Lesson {
  const tasks: Task[] = (data.tasks ?? []).map((t, i) => ({ ...t, id: `t${i + 1}` })).filter(isUsableTask);
  const segments = (data.segments ?? []).filter((x) => x.text.trim().length > 0);
  if (segments.length === 0 || tasks.length < 4) throw new LessonError("The generated lesson was incomplete. Please try again.");
  return {
    ...data,
    // The lesson was written for the target level; use it even if the model labelled it differently.
    level: target.level,
    id: `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    segments,
    tasks,
    source: {
      kind: material.kind,
      title: material.title,
      url: material.url,
      publisher: material.publisher,
      license: material.license,
      ...(material.audioUrl ? { audioUrl: material.audioUrl } : {}),
    },
  };
}

export async function generateLesson(
  apiKey: string,
  s: Settings,
  mode: Mode,
  target: Target,
  material: Material,
  signal?: AbortSignal,
  tag: CostTag = { job: "lesson", mode },
): Promise<{ lesson: Lesson; cost: UsageCost }> {
  const client = makeClient(apiKey);
  const { data, cost } = await callStructured<GeneratedLesson>(client, s.model, {
    system: LESSON_SYSTEM,
    user: lessonPrompt(mode, target, material, s),
    schema: LESSON_SCHEMA,
    effort: "medium",
    tag,
    signal,
  });
  return { lesson: finishLesson(data, target, material), cost };
}

/**
 * Text-bank lessons: one request in which Claude fetches the page (on
 * Anthropic's side; the site doesn't allow browser requests) and writes the
 * lesson from it. If the page can't be loaded we fail instead of letting the
 * model invent a text.
 */
export async function generateLessonFromPage(
  apiKey: string,
  s: Settings,
  mode: Mode,
  target: Target,
  material: Material,
  signal?: AbortSignal,
  tag: CostTag = { job: "lesson", mode },
): Promise<{ lesson: Lesson; cost: UsageCost }> {
  const client = makeClient(apiKey);
  const host = new URL(material.url!).hostname;
  const schema = betaJSONSchemaOutputFormat(LESSON_SCHEMA as any).schema;
  const messages: any[] = [{ role: "user", content: lessonPrompt(mode, target, material, s) }];
  let structured = true;
  let cost = ZERO_COST;
  let fetched = false;
  let fetchError: string | null = null;
  let pageText = "";
  let text = "";

  for (let i = 0; i < 4; i++) {
    let msg: any;
    try {
      msg = await client.beta.messages.create(
        {
          model: s.model,
          max_tokens: 16000,
          system: LESSON_SYSTEM,
          messages,
          tools: [
            {
              type: "web_fetch_20260209",
              name: "web_fetch",
              max_uses: 2,
              allowed_domains: [host],
              max_content_tokens: 15000,
              citations: { enabled: false },
            },
          ],
          output_config: structured
            ? { effort: "medium", format: { type: "json_schema", schema } }
            : { effort: "medium" },
          ...fallbackParams(s.model),
        } as any,
        { signal },
      );
    } catch (e) {
      // If structured output can't be combined with the fetch tool, retry once asking for plain JSON.
      if (structured && i === 0 && e instanceof Anthropic.BadRequestError) {
        structured = false;
        messages[0] = { role: "user", content: `${messages[0].content}\n\nReply with only the JSON object for the lesson, no other text.` };
        continue;
      }
      throw e;
    }
    const stepCost = costOf(s.model, msg.usage);
    recordCost(tag, s.model, stepCost);
    cost = addCost(cost, stepCost);
    for (const b of msg.content) {
      if (b.type === "web_fetch_tool_result") {
        if (b.content?.type === "web_fetch_tool_result_error") fetchError = b.content.error_code;
        else {
          fetched = true;
          const src = b.content?.content?.source;
          if (src?.type === "text" && typeof src.data === "string") pageText += `\n${src.data}`;
        }
      }
    }
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    checkStop(msg.stop_reason);
    text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    break;
  }

  if (!fetched) throw new LessonError(`Couldn't load the text from ${host}${fetchError ? ` (${fetchError})` : ""}.`);
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let data: GeneratedLesson;
  try {
    data = JSON.parse(json);
  } catch {
    throw new LessonError("Couldn't read the generated lesson. Please try again.");
  }
  const lesson = finishLesson(data, target, material);
  if (material.audioUrl) {
    // The learner hears the original recording: the transcript must be the original, word for word.
    const c = checkTranscript(lesson.segments, pageText);
    if (!c.ok) {
      throw new LessonError(
        c.words < 30
          ? "The recording's transcript couldn't be read."
          : `The transcript didn't match the recording (${Math.round(c.matched * 100)}% word for word).`,
      );
    }
  }
  return { lesson, cost };
}

/* ---------------- Grading free-text answers ---------------- */

export const GRADING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results", "overall_comment"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["task_id", "score", "feedback", "corrected_answer", "cefr_level"],
        properties: {
          task_id: str,
          score: { type: "number" },
          feedback: str,
          corrected_answer: str,
          cefr_level: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1"] },
        },
      },
    },
    overall_comment: str,
  },
} as const;

export interface GradingOutput {
  results: { task_id: string; score: number; feedback: string; corrected_answer: string; cefr_level?: Cefr }[];
  overall_comment: string;
}

export async function gradeWritten(
  apiKey: string,
  s: Settings,
  level: Cefr,
  text: string,
  items: GradingItem[],
  autoSummary: string,
  signal?: AbortSignal,
): Promise<{ data: GradingOutput; cost: UsageCost }> {
  const client = makeClient(apiKey);
  return callStructured<GradingOutput>(client, s.model, {
    system: GRADING_SYSTEM,
    user: gradingPrompt(level, text, items, autoSummary, s),
    schema: GRADING_SCHEMA,
    effort: "low",
    tag: { job: "grading" },
    signal,
  });
}

/* ---------------- Extra practice tasks ---------------- */

export const EXTRA_TASKS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: { tasks: LESSON_SCHEMA.properties.tasks },
} as const;

/** Extra questions on the same text for weak task types (one request). */
export async function generateExtraTasks(
  apiKey: string,
  s: Settings,
  lesson: Lesson,
  mode: Mode,
  plan: { skill: Task["skill"]; count: number }[],
  signal?: AbortSignal,
): Promise<{ tasks: Task[]; cost: UsageCost }> {
  const client = makeClient(apiKey);
  const text = lesson.segments.map((x) => (x.speaker ? `${x.speaker}: ${x.text}` : x.text)).join("\n");
  const { data, cost } = await callStructured<{ tasks: Omit<Task, "id">[] }>(client, s.model, {
    system: LESSON_SYSTEM,
    user: extraTasksPrompt(lesson.level, mode, text, lesson.tasks, plan, s),
    schema: EXTRA_TASKS_SCHEMA,
    effort: "low",
    tag: { job: "extras", mode },
    signal,
  });
  const wanted = new Set(plan.map((p) => p.skill));
  const tasks = (data.tasks ?? [])
    .map((t, i): Task => ({ ...t, id: `x${i + 1}`, extra: true }))
    .filter((t) => isUsableTask(t) && wanted.has(t.skill) && t.type !== "short_answer");
  if (!tasks.length) throw new LessonError("No usable extra tasks were returned.");
  return { tasks, cost };
}

/* ---------------- Word glosses ---------------- */

const GLOSS_ITEM = {
  type: "object",
  additionalProperties: false,
  required: ["form", "lemma", "en", "note"],
  properties: { form: str, lemma: str, en: str, note: str },
} as const;

export const GLOSSES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["glosses"],
  properties: { glosses: { type: "array", items: GLOSS_ITEM } },
} as const;

/** Glosses for every word of a lesson (one request). */
export async function generateGlosses(
  apiKey: string,
  s: Settings,
  lesson: Lesson,
  signal?: AbortSignal,
): Promise<{ entries: GlossEntry[]; cost: UsageCost }> {
  const client = makeClient(apiKey);
  const text = lesson.segments.map((x) => x.text).join("\n");
  const { data, cost } = await callStructured<{ glosses: GlossEntry[] }>(client, s.model, {
    system: GLOSS_SYSTEM,
    user: glossPrompt(lesson.level, text),
    schema: GLOSSES_SCHEMA,
    effort: "low",
    tag: { job: "glosses" },
    signal,
  });
  const entries = (data.glosses ?? []).filter((g) => g.form?.trim() && g.en?.trim());
  if (!entries.length) throw new LessonError("No glosses were returned.");
  return { entries, cost };
}

/** On-demand gloss for one tapped word, in its sentence. */
export async function lookupWord(
  apiKey: string,
  s: Settings,
  word: string,
  sentence: string,
  signal?: AbortSignal,
): Promise<{ entry: GlossEntry; cost: UsageCost }> {
  const client = makeClient(apiKey);
  const { data, cost } = await callStructured<GlossEntry>(client, s.model, {
    system: GLOSS_SYSTEM,
    user: lookupPrompt(word, sentence),
    schema: GLOSS_ITEM,
    effort: "low",
    tag: { job: "lookup" },
    signal,
  });
  return { entry: { ...data, form: word }, cost };
}

/** User-facing message for API errors. */
export function describeError(e: unknown): string {
  if (e instanceof LessonError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "Your API key was rejected. Check it in Settings.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to do that (permission denied).";
  if (e instanceof Anthropic.RateLimitError) return "Rate limit or spend limit reached. Wait a bit, or check your limits in the Anthropic Console.";
  if (e instanceof Anthropic.BadRequestError) {
    const m = (e as any)?.error?.error?.message ?? e.message;
    if (/credit balance/i.test(m)) return "Your Anthropic credit balance is too low. Add credit in the Anthropic Console.";
    return `The API rejected the request: ${m}`;
  }
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API. Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `API error (${e.status ?? "?"}). Please try again.`;
  if (e instanceof DOMException && e.name === "AbortError") return "Cancelled.";
  return e instanceof Error ? e.message : String(e);
}
