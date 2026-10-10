// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: build, parse and clean campaign (UTM) URLs. Original source; copy and adapt.
// Pure string handling that keeps existing query parameters in place with their original
// encoding. Values are trimmed and lowercased so reports do not split "Email" from "email".

export interface UtmParams { source: string; medium: string; campaign: string; term?: string; content?: string; id?: string }
export type UtmKey = "id" | "source" | "medium" | "campaign" | "term" | "content";

/** Output order for both buildUtmUrl and parseUtm. */
export const UTM_KEYS: readonly UtmKey[] = ["id", "source", "medium", "campaign", "term", "content"];
export const TRACKING_PARAMS: readonly string[] = [
  "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "twclid", "li_fat_id", "mc_cid", "mc_eid",
  "_hsenc", "_hsmi", "yclid", "igshid",
];

interface SplitUrl { base: string; params: string[]; fragment: string }

function splitUrl(url: string, label: string): SplitUrl {
  if (typeof url !== "string" || /[\u0000- \u007f]/.test(url) || !/^https?:\/\/[^/?#]+/i.test(url)) {
    throw new Error(`${label} must be an absolute http(s) URL`);
  }
  const hash = url.indexOf("#");
  const fragment = hash < 0 ? "" : url.slice(hash);
  const rest = hash < 0 ? url : url.slice(0, hash);
  const q = rest.indexOf("?");
  if (q < 0) return { base: rest, params: [], fragment };
  return { base: rest.slice(0, q), params: rest.slice(q + 1).split("&").filter((p) => p !== ""), fragment };
}

function joinUrl({ base, params, fragment }: SplitUrl): string {
  return base + (params.length > 0 ? `?${params.join("&")}` : "") + fragment;
}

const rawKey = (param: string): string => { const eq = param.indexOf("="); return eq < 0 ? param : param.slice(0, eq); };

/** RFC 3986 percent-encoding of UTF-8 bytes, keeping only unreserved A-Z a-z 0-9 - . _ ~. */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    throw new Error(`invalid percent-encoding in ${JSON.stringify(value)}`);
  }
}

/** Appends utm_* parameters (replacing same-named ones in place) before any #fragment. */
export function buildUtmUrl(baseUrl: string, params: UtmParams): string {
  const parts = splitUrl(baseUrl, "baseUrl");
  const values: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const raw: unknown = params[key];
    if (raw !== undefined && typeof raw !== "string") throw new TypeError(`${key} must be a string`);
    const value = (raw ?? "").trim().toLowerCase();
    if (value === "") {
      if (key === "source" || key === "medium" || key === "campaign") throw new Error(`${key} is required`);
      continue;
    }
    values[key] = value;
  }
  for (const key of UTM_KEYS) {
    const value = values[key];
    if (value === undefined) continue;
    const name = `utm_${key}`;
    const pair = `${name}=${percentEncode(value)}`;
    const index = parts.params.findIndex((p) => rawKey(p) === name);
    if (index < 0) { parts.params.push(pair); continue; }
    parts.params = parts.params.filter((p, i) => i <= index || rawKey(p) !== name);
    parts.params[index] = pair;
  }
  return joinUrl(parts);
}

/** Present utm_* values without the prefix, decoded (+ is a space), first occurrence wins. */
export function parseUtm(url: string): Partial<Record<UtmKey, string>> {
  const found = new Map<string, string>();
  for (const param of splitUrl(url, "url").params) {
    const eq = param.indexOf("=");
    const key = decodeComponent(eq < 0 ? param : param.slice(0, eq));
    if (!key.startsWith("utm_") || found.has(key)) continue;
    found.set(key, decodeComponent(eq < 0 ? "" : param.slice(eq + 1)));
  }
  const result: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const value = found.get(`utm_${key}`);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/** Removes utm_* and click-ID parameters; other parameters keep their order and encoding. */
export function stripTracking(url: string): string {
  const parts = splitUrl(url, "url");
  parts.params = parts.params.filter((p) => {
    const key = rawKey(p);
    return !key.startsWith("utm_") && !TRACKING_PARAMS.includes(key);
  });
  return joinUrl(parts);
}
