import type { Cefr, Mode, SourceKind, Settings } from "./types";
import textbankIndex from "../data/textbank-index.json";

/** Raw material a lesson is adapted from. */
export interface Material {
  kind: SourceKind;
  /** Greek source text (news facts or Wikipedia extract); empty for "ai". */
  text: string;
  title?: string;
  url?: string;
  publisher?: string;
  license?: string;
  /** Topic hint for AI-written texts. */
  topicHint?: string;
  /** Text bank: the CEFR level the Centre assigned to the text. */
  gradedLevel?: Cefr;
}

export function enabledSources(s: Settings): SourceKind[] {
  const all: SourceKind[] = ["textbank", "wikipedia", "news", "ai"];
  const on = all.filter((k) => s.sources[k]);
  return on.length ? on : ["ai"];
}


/**
 * Source for "Mixed" sessions and for the background stock. Open or
 * learner-graded material comes first; commercial news sites are only used
 * when the learner picks "News" explicitly. AI-written texts are used for
 * listening dialogues now and then, or when nothing else is enabled.
 */
export function pickMixedSource(s: Settings, mode: Mode, rnd: () => number = Math.random): SourceKind {
  const weights: [SourceKind, number][] =
    mode === "reading"
      ? [["textbank", 0.6], ["wikipedia", 0.4]]
      : [["textbank", 0.6], ["wikipedia", 0.2], ["ai", 0.2]];
  const on = weights.filter(([k]) => s.sources[k]);
  if (!on.length) return s.sources.ai || !s.sources.news ? "ai" : "news";
  const total = on.reduce((a, [, w]) => a + w, 0);
  let r = rnd() * total;
  for (const [k, w] of on) {
    if ((r -= w) < 0) return k;
  }
  return on[on.length - 1][0];
}

/* ---------------- Centre for the Greek Language: text bank ---------------- */

export interface TextbankItem {
  id: number;
  title: string;
  level: Cefr;
  skill: Mode;
}

export const TEXTBANK: TextbankItem[] = (textbankIndex as { items: TextbankItem[] }).items;

export const textbankUrl = (id: number) => `https://www.greek-language.gr/certification/dbs/teachers/show.html?id=${id}`;

/** A text-bank text for this skill at exactly this level that hasn't been used yet. */
export function pickTextbank(
  mode: Mode,
  level: Cefr,
  usedUrls: Set<string>,
  rnd: () => number = Math.random,
): TextbankItem | null {
  const pool = TEXTBANK.filter((t) => t.skill === mode && t.level === level && !usedUrls.has(textbankUrl(t.id)));
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}

export function interestList(s: Settings): string[] {
  return s.interests
    .split(/[,\n;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/* ---------------- Greek Wikipedia ---------------- */

const WIKI_API = "https://el.wikipedia.org/w/api.php";
const MIN_EXTRACT = 1500;
const MAX_EXTRACT = 7000;

async function wikiQuery(params: Record<string, string>, signal?: AbortSignal): Promise<any> {
  const qs = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  const res = await fetch(`${WIKI_API}?${qs}`, { signal });
  if (!res.ok) throw new Error(`Wikipedia returned HTTP ${res.status}`);
  return res.json();
}

async function candidateTitles(interests: string[], rnd: () => number, signal?: AbortSignal): Promise<string[]> {
  if (interests.length && rnd() < 0.7) {
    const term = interests[Math.floor(rnd() * interests.length)];
    const j = await wikiQuery({ action: "query", list: "search", srsearch: term, srnamespace: "0", srlimit: "20" }, signal);
    const hits: { title: string; size?: number }[] = j?.query?.search ?? [];
    const good = hits.filter((h) => (h.size ?? 0) > 4000);
    const pool = good.length ? good : hits;
    if (pool.length) {
      const start = Math.floor(rnd() * pool.length);
      return [...pool.slice(start), ...pool.slice(0, start)].map((h) => h.title).slice(0, 4);
    }
  }
  // Random articles: take a batch and prefer the longest (random picks are often stubs).
  const j = await wikiQuery(
    { action: "query", generator: "random", grnnamespace: "0", grnlimit: "20", prop: "info" },
    signal,
  );
  const pages: { title: string; length?: number }[] = j?.query?.pages ?? [];
  return pages
    .slice()
    .sort((a, b) => (b.length ?? 0) - (a.length ?? 0))
    .slice(0, 4)
    .map((p) => p.title);
}

export async function fetchWikipedia(
  s: Settings,
  avoidTitles: string[] = [],
  rnd: () => number = Math.random,
  signal?: AbortSignal,
): Promise<Material> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const titles = (await candidateTitles(interestList(s), rnd, signal)).filter((t) => !avoidTitles.includes(t));
    for (const title of titles) {
      const j = await wikiQuery(
        {
          action: "query",
          prop: "extracts|info",
          inprop: "url",
          explaintext: "1",
          exsectionformat: "plain",
          redirects: "1",
          titles: title,
        },
        signal,
      );
      const page = j?.query?.pages?.[0];
      const extract: string = page?.extract ?? "";
      if (extract.length >= MIN_EXTRACT) {
        return {
          kind: "wikipedia",
          text: extract.slice(0, MAX_EXTRACT),
          title: page.title,
          url: page.fullurl ?? `https://el.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
          publisher: "Βικιπαίδεια",
          license: "CC BY-SA 4.0",
        };
      }
    }
  }
  throw new Error("Couldn't find a suitable Wikipedia article. Try again, or change your interests.");
}

/* ---------------- AI-written everyday texts ---------------- */

const EVERYDAY_TOPICS = [
  "a conversation at a bakery or a laiki (street market)",
  "booking a room on an island by phone",
  "two friends planning a weekend trip",
  "a voicemail from a landlord about repairs",
  "an email to a colleague about a schedule change",
  "a radio announcement about a ferry strike and changed timetables",
  "a doctor's appointment",
  "a neighbour asking for help",
  "a short story about a name day celebration",
  "a blog post about learning to cook a regional dish",
  "a dialogue at the KTEO or a public service office",
  "a weather forecast and its effect on weekend plans",
  "a museum audio guide",
  "a podcast-style monologue about city life vs village life",
  "a customer complaint about a delivery",
  "a job interview for a summer job",
  "a story about a lost item on the metro",
  "parents discussing school and after-school activities",
  "an announcement at the airport or port",
  "a short opinion piece about tourism on the islands",
];

export function aiMaterial(s: Settings, rnd: () => number = Math.random): Material {
  const interests = interestList(s);
  const useInterest = interests.length > 0 && rnd() < 0.5;
  const topicHint = useInterest
    ? `something related to: ${interests[Math.floor(rnd() * interests.length)]}`
    : EVERYDAY_TOPICS[Math.floor(rnd() * EVERYDAY_TOPICS.length)];
  return { kind: "ai", text: "", topicHint };
}
