import type { ModelId, UsageCost } from "./types";

/**
 * List prices in USD per million tokens (Anthropic first-party API), as
 * published for these models in November 2026. Used only to ESTIMATE spend
 * in the stats screen - your Anthropic Console shows the real bill.
 * Haiku 5.5's price applies to prompts up to 100K tokens; lessons stay far
 * below that.
 */
export const MODEL_INFO: Record<ModelId, { label: string; input: number; output: number; serverFallback: boolean }> = {
  "claude-opus-5-5": { label: "Claude Opus 5.5 (best quality)", input: 4, output: 20, serverFallback: true },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5 (about half the cost)", input: 2, output: 10, serverFallback: true },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5 (cheapest, Greek quality untested)", input: 0.1, output: 0.5, serverFallback: false },
};

/** Web search is billed at $10 per 1,000 searches; web fetch has no extra charge beyond tokens. */
export const WEB_SEARCH_USD = 0.01;

export interface RawUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number } | null;
}

export function costOf(model: ModelId, u: RawUsage): UsageCost {
  const p = MODEL_INFO[model];
  // We don't request prompt caching. If cache tokens ever appear, count writes
  // at 1.25x input and reads at 0.1x (an upper bound for these models).
  const input =
    u.input_tokens + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  const usd = (input * p.input + u.output_tokens * p.output) / 1_000_000 + searches * WEB_SEARCH_USD;
  return {
    inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    outputTokens: u.output_tokens,
    webSearches: searches,
    usd,
  };
}

export function addCost(a: UsageCost, b: UsageCost): UsageCost {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    webSearches: a.webSearches + b.webSearches,
    usd: a.usd + b.usd,
  };
}

export const ZERO_COST: UsageCost = { inputTokens: 0, outputTokens: 0, webSearches: 0, usd: 0 };
