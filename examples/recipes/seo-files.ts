// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: sitemap.xml, robots.txt (with AI-crawler rules) and llms.txt generation.
// Original source; copy and adapt. Pure and deterministic: no network access, "\n" newlines.
// Sitemaps follow https://www.sitemaps.org/protocol.html; llms.txt follows https://llmstxt.org.
// robots.txt is advisory: crawlers may ignore it, so never rely on it for access control.

export type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
export interface SitemapEntry { loc: string; lastmod?: string; changefreq?: ChangeFreq; priority?: number }
export interface RobotsRule { userAgent: string; allow?: string[]; disallow?: string[] }
export type AiCrawlerPolicy = "allow" | "disallow" | "default";
export interface RobotsOptions { rules?: RobotsRule[]; aiCrawlers?: AiCrawlerPolicy; sitemaps?: string[] }
export interface LlmsLink { title: string; url: string; description?: string }
export interface LlmsSection { name: string; links: LlmsLink[] }
export interface LlmsOptions { title: string; summary?: string; sections?: LlmsSection[] }

export const CHANGE_FREQS: readonly ChangeFreq[] = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"];
/** Order matters: output lists these user agents exactly in this sequence. */
export const AI_CRAWLERS: readonly string[] = [
  "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "Google-Extended",
  "PerplexityBot", "CCBot", "Bytespider", "Applebot-Extended", "Meta-ExternalAgent",
];
export const MAX_SITEMAP_ENTRIES = 50000;

/** Absolute http(s) URL with a host and no whitespace or control characters. */
export function isAbsoluteHttpUrl(value: unknown, httpsOnly = false): value is string {
  if (typeof value !== "string" || /[\u0000- \u007f]/.test(value)) return false;
  const match = /^(https?):\/\/([^/?#]+)/i.exec(value);
  return match !== null && (!httpsOnly || match[1]?.toLowerCase() === "https");
}

/** Escapes & < > " ' for XML text and attribute values. */
export function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

function isDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= (days[mo - 1] ?? 0);
}

/** One decimal, rounding half up on priority * 10 (0.25 -> "0.3", 0.85 -> "0.9"). */
export function formatPriority(priority: number): string {
  const tenths = Math.floor(priority * 10 + 0.5);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

export function sitemapXml(entries: readonly SitemapEntry[]): string {
  if (!Array.isArray(entries)) throw new TypeError("entries must be an array");
  if (entries.length > MAX_SITEMAP_ENTRIES) throw new RangeError(`a sitemap holds at most ${MAX_SITEMAP_ENTRIES} entries`);
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  entries.forEach((entry, i) => {
    const { loc, lastmod, changefreq, priority } = entry;
    if (!isAbsoluteHttpUrl(loc)) throw new Error(`entry ${i}: loc must be an absolute http(s) URL`);
    lines.push("  <url>", `    <loc>${xmlEscape(loc)}</loc>`);
    if (lastmod !== undefined) {
      if (typeof lastmod !== "string" || !isDate(lastmod)) throw new Error(`entry ${i}: lastmod must be a valid YYYY-MM-DD date`);
      lines.push(`    <lastmod>${xmlEscape(lastmod)}</lastmod>`);
    }
    if (changefreq !== undefined) {
      if (!CHANGE_FREQS.includes(changefreq)) throw new Error(`entry ${i}: changefreq must be one of ${CHANGE_FREQS.join(", ")}`);
      lines.push(`    <changefreq>${xmlEscape(changefreq)}</changefreq>`);
    }
    if (priority !== undefined) {
      if (typeof priority !== "number" || !Number.isFinite(priority) || priority < 0 || priority > 1) {
        throw new RangeError(`entry ${i}: priority must be a number from 0.0 to 1.0`);
      }
      lines.push(`    <priority>${formatPriority(priority)}</priority>`);
    }
    lines.push("  </url>");
  });
  lines.push("</urlset>");
  return lines.join("\n") + "\n";
}

function singleLine(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  if (/[\r\n]/.test(value)) throw new Error(`${label} must not contain newline characters`);
  return value;
}

function robotsPath(value: unknown, label: string): string {
  const path = singleLine(value, label);
  if (!path.startsWith("/") && !path.startsWith("*")) throw new Error(`${label} must start with "/" or "*"`);
  return path;
}

export function robotsTxt(options: RobotsOptions = {}): string {
  const { rules = [], aiCrawlers = "default", sitemaps = [] } = options;
  if (!["allow", "disallow", "default"].includes(aiCrawlers)) throw new Error('aiCrawlers must be "allow", "disallow" or "default"');
  const lines: string[] = [];
  rules.forEach((rule, i) => {
    const allow = rule.allow ?? [];
    const disallow = rule.disallow ?? [];
    if (allow.length + disallow.length === 0) throw new Error(`rule ${i}: add at least one allow or disallow path`);
    lines.push(`User-agent: ${singleLine(rule.userAgent, `rule ${i} userAgent`)}`);
    for (const p of allow) lines.push(`Allow: ${robotsPath(p, `rule ${i} allow path`)}`);
    for (const p of disallow) lines.push(`Disallow: ${robotsPath(p, `rule ${i} disallow path`)}`);
    lines.push("");
  });
  if (aiCrawlers !== "default") {
    for (const agent of AI_CRAWLERS) lines.push(`User-agent: ${agent}`);
    lines.push(aiCrawlers === "allow" ? "Allow: /" : "Disallow: /", "");
  }
  for (const url of sitemaps) {
    if (!isAbsoluteHttpUrl(url)) throw new Error("sitemaps must be absolute http(s) URLs");
    lines.push(`Sitemap: ${url}`);
  }
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length === 0 ? "" : lines.join("\n") + "\n";
}

export function llmsTxt(options: LlmsOptions): string {
  const lines = [`# ${singleLine(options.title, "title")}`, ""];
  if (options.summary !== undefined && options.summary !== "") lines.push(`> ${singleLine(options.summary, "summary")}`, "");
  (options.sections ?? []).forEach((section, i) => {
    if (!Array.isArray(section.links) || section.links.length === 0) throw new Error(`section ${i}: add at least one link`);
    if (i > 0) lines.push("");
    lines.push(`## ${singleLine(section.name, `section ${i} name`)}`, "");
    section.links.forEach((link, j) => {
      const label = `section ${i} link ${j}`;
      const title = singleLine(link.title, `${label} title`).replace(/\]/g, "\\]");
      if (!isAbsoluteHttpUrl(link.url)) throw new Error(`${label} url must be an absolute http(s) URL`);
      const description = link.description === undefined || link.description === "" ? "" : `: ${singleLine(link.description, `${label} description`)}`;
      lines.push(`- [${title}](${link.url})${description}`);
    });
  });
  while (lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}
