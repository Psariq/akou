import Anthropic from "@anthropic-ai/sdk";
import type { Lesson, Mode, Settings, SourceKind, UsageCost } from "./types";
import type { Target } from "./cefr";
import {
  aiMaterial,
  fetchWikipedia,
  interestList,
  pickMixedSource,
  pickTextbank,
  textbankUrl,
  type Material,
} from "./sources";
import { LessonError, describeError, findNews, generateLesson, generateLessonFromPage } from "./claude";
import { addCost } from "./pricing";

export interface CreateOptions {
  /** A specific article to adapt (implies the news source). */
  url?: string;
  /** Titles of texts already used, so sources don't repeat. */
  avoidTitles?: string[];
  /** Source URLs already used (text-bank texts are never repeated). */
  usedUrls?: string[];
  signal?: AbortSignal;
  onStep?: (text: string) => void;
  onNote?: (text: string) => void;
}

const SOURCE_LABEL: Record<SourceKind, string> = {
  textbank: "graded text",
  wikipedia: "Wikipedia article",
  news: "news article",
  ai: "everyday text",
};

/** Errors that another source can't fix (bad key, rate/spend limit, connection, refusal …). */
function isFatal(e: unknown): boolean {
  return e instanceof Anthropic.APIError && !(e instanceof LessonError);
}

/**
 * Make a lesson. With source "mixed" the source is chosen by
 * pickMixedSource() and, if it fails, the next one is tried:
 * text bank → Wikipedia → AI-written. A specific source is tried alone.
 */
export async function createLesson(
  apiKey: string,
  settings: Settings,
  mode: Mode,
  target: Target,
  source: SourceKind | "mixed",
  opts: CreateOptions = {},
): Promise<{ lesson: Lesson; cost: UsageCost }> {
  const { signal, onStep = () => {}, onNote = () => {} } = opts;
  const avoid = opts.avoidTitles ?? [];
  const usedUrls = new Set(opts.usedUrls ?? []);
  const mixed = source === "mixed" && !opts.url;
  const first: SourceKind = opts.url ? "news" : mixed ? pickMixedSource(settings, mode) : (source as SourceKind);
  const chain: SourceKind[] = mixed
    ? [...new Set<SourceKind>([first, "textbank", "wikipedia", "ai"])].filter((k) => k === "ai" || settings.sources[k])
    : [first];

  const writing = () => onStep(`Writing a ${target.level} ${mode === "reading" ? "text" : "listening script"} and tasks…`);

  for (const [i, kind] of chain.entries()) {
    try {
      switch (kind) {
        case "textbank": {
          const item = pickTextbank(mode, target.level, usedUrls);
          if (!item) throw new LessonError(`no unused ${target.level} ${mode} text left in the text bank`);
          onStep("Fetching a graded text from the Centre for the Greek Language…");
          const material: Material = {
            kind: "textbank",
            text: "",
            title: item.title,
            url: textbankUrl(item.id),
            publisher: "Κέντρο Ελληνικής Γλώσσας",
            license: "© ΚΕΓ, used for personal study",
            gradedLevel: item.level,
          };
          return await generateLessonFromPage(apiKey, settings, mode, target, material, signal);
        }
        case "news": {
          onStep(opts.url ? "Fetching your article…" : "Finding a current Greek news article…");
          const r = await findNews(apiKey, settings, { avoidTitles: avoid, interests: interestList(settings), url: opts.url, signal });
          writing();
          const l = await generateLesson(apiKey, settings, mode, target, r.material, signal);
          return { lesson: l.lesson, cost: addCost(r.cost, l.cost) };
        }
        case "wikipedia": {
          onStep("Picking a Greek Wikipedia article…");
          const material = await fetchWikipedia(settings, avoid, Math.random, signal);
          writing();
          return await generateLesson(apiKey, settings, mode, target, material, signal);
        }
        case "ai": {
          writing();
          return await generateLesson(apiKey, settings, mode, target, aiMaterial(settings), signal);
        }
      }
    } catch (e) {
      const last = i === chain.length - 1;
      if (signal?.aborted || !mixed || last || isFatal(e)) throw e;
      onNote(`No ${SOURCE_LABEL[kind]} this time (${describeError(e)}); using another source.`);
    }
  }
  throw new LessonError("No source available.");
}
