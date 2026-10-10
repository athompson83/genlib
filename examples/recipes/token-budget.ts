// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: rough token estimation and chat-history trimming to a context budget. Original source; copy and adapt.
//
// CAVEAT: estimateTokens uses ~4 characters per token, a rough average for English prose.
// Real counts depend on the model's tokenizer and are often higher for code, JSON, non-Latin
// scripts and emoji. Keep a safety margin, and use the provider's token-counting endpoint or
// tokenizer when limits are strict or billing matters. Estimates are not billing figures.

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Messages sharing a group (for example a tool call and its result) are kept or dropped together. */
  group?: string;
}

export interface BudgetOptions {
  /** Tokens to leave free for the model's reply. */
  reserveForOutput?: number;
  /** Estimated per-message framing overhead (default 4). */
  perMessageOverhead?: number;
  estimate?: (text: string) => number;
}

export interface TrimResult<M extends ChatMessage> { messages: M[]; dropped: number; estimatedTokens: number; truncatedLatest: boolean }

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/** Keeps the first `maxTokens`-worth of text (or the end when from = "end"), never splitting a code point. */
export function truncateToTokens(text: string, maxTokens: number, options: { keep?: "start" | "end"; marker?: string } = {}): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const marker = options.marker ?? "\n[...truncated...]\n";
  const room = Math.max(0, maxTokens * 4 - marker.length);
  const chars = Array.from(text);
  let kept = "";
  if (options.keep === "end") {
    for (let i = chars.length - 1; i >= 0 && kept.length + (chars[i]?.length ?? 0) <= room; i--) kept = (chars[i] ?? "") + kept;
    return marker + kept;
  }
  for (const ch of chars) { if (kept.length + ch.length > room) break; kept += ch; }
  return kept + marker;
}

/**
 * Trims a conversation to fit `budget` tokens: every system message is kept, then whole
 * groups are added from newest to oldest while they fit; original order is preserved.
 * If the newest unit is a single message that does not fit, it is kept and truncated keeping
 * its end (truncatedLatest); a newest multi-message group that does not fit is dropped.
 * Throws if the system messages alone exceed the budget.
 */
export function trimToBudget<M extends ChatMessage>(messages: readonly M[], budget: number, options: BudgetOptions = {}): TrimResult<M> {
  const estimate = options.estimate ?? estimateTokens;
  const overhead = options.perMessageOverhead ?? 4;
  const limit = budget - (options.reserveForOutput ?? 0);
  if (!Number.isFinite(limit) || limit <= 0) throw new RangeError("Budget after reserveForOutput must be positive");
  const cost = (m: ChatMessage) => estimate(m.content) + overhead;
  const systemCost = messages.filter((m) => m.role === "system").reduce((sum, m) => sum + cost(m), 0);
  if (systemCost > limit) throw new RangeError("System messages alone exceed the token budget");

  // Units: consecutive non-system messages sharing a group id.
  const units: number[][] = [];
  messages.forEach((m, index) => {
    if (m.role === "system") return;
    const last = units[units.length - 1];
    const prev = last ? messages[last[last.length - 1] ?? -1] : undefined;
    if (last && m.group !== undefined && prev?.group === m.group) last.push(index); else units.push([index]);
  });

  const keep = new Set<number>(messages.flatMap((m, i) => (m.role === "system" ? [i] : [])));
  let used = systemCost;
  let truncatedLatest = false;
  const result = messages.slice();
  for (let u = units.length - 1; u >= 0; u--) {
    const unit = units[u] ?? [];
    const unitCost = unit.reduce((sum, i) => sum + cost(messages[i] as M), 0);
    if (used + unitCost <= limit) { unit.forEach((i) => keep.add(i)); used += unitCost; continue; }
    if (u === units.length - 1 && unit.length === 1) {
      const index = unit[0] as number;
      const original = messages[index] as M;
      const room = Math.max(1, limit - used - overhead);
      result[index] = { ...original, content: truncateToTokens(original.content, room, { keep: "end" }) };
      keep.add(index);
      used += cost(result[index] as M);
      truncatedLatest = true;
    }
    break; // stop at the first unit that does not fit, so no gaps appear in the history
  }
  const kept = result.filter((_, i) => keep.has(i));
  return { messages: kept, dropped: messages.length - kept.length, estimatedTokens: used, truncatedLatest };
}
