import type { Lesson, Mode, Settings, SourceKind, UsageCost } from "./types";
import type { Target } from "./cefr";
import { aiMaterial, fetchWikipedia, interestList, pickSource, type Material } from "./sources";
import { describeError, findNews, generateLesson } from "./claude";
import { addCost, ZERO_COST } from "./pricing";

export interface CreateOptions {
  /** A specific article to adapt (implies the news source). */
  url?: string;
  /** Titles of texts already used, so sources don't repeat. */
  avoidTitles?: string[];
  signal?: AbortSignal;
  onStep?: (text: string) => void;
  onNote?: (text: string) => void;
}

/**
 * Gather source material (news / Wikipedia / everyday topic) and have Claude
 * write a lesson from it. With source "mixed", a failing news or Wikipedia
 * lookup falls back to the next source instead of failing.
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
  const chosen: SourceKind = opts.url ? "news" : source === "mixed" ? pickSource(settings) : source;
  const mixed = source === "mixed" && !opts.url;
  let cost = ZERO_COST;
  let material: Material | null = null;

  if (chosen === "news") {
    onStep(opts.url ? "Fetching your article…" : "Finding a current Greek news article…");
    try {
      const r = await findNews(apiKey, settings, { avoidTitles: avoid, interests: interestList(settings), url: opts.url, signal });
      cost = addCost(cost, r.cost);
      material = r.material;
    } catch (e) {
      if (signal?.aborted || !mixed) throw e;
      onNote(`No news article this time (${describeError(e)}), so here is a different text.`);
    }
  }
  if (!material && (chosen === "wikipedia" || (mixed && settings.sources.wikipedia && chosen === "news"))) {
    onStep("Picking a Greek Wikipedia article…");
    try {
      material = await fetchWikipedia(settings, avoid, Math.random, signal);
    } catch (e) {
      if (signal?.aborted || !mixed) throw e;
      onNote("Wikipedia wasn't reachable, so here is an everyday text instead.");
    }
  }
  if (!material) material = aiMaterial(settings);

  onStep(`Writing a ${target.level} ${mode === "reading" ? "text" : "listening script"} and tasks…`);
  const r = await generateLesson(apiKey, settings, mode, target, material, signal);
  return { lesson: r.lesson, cost: addCost(cost, r.cost) };
}
