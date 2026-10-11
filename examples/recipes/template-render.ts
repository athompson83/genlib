// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: minimal logic-less templates (a Mustache subset), e.g. "Hello {{ user.name }}!". Original source.
// {{ path }} inserts the value at a dotted path (names and [n]) HTML-escaped (& < > " ') unless escape is false;
// {{{ path }}} inserts it raw; whitespace inside braces is ignored; missing values render as "". {{# path }}..{{/ path }}
// renders once per item of a non-empty array ("." is the item; names look in the item first, then outer scopes) or
// once for another truthy value (an object also becomes the innermost scope); {{^ path }}..{{/ path }} renders when
// the value is missing or falsy; {{! comment }} is dropped. Values: null "", booleans "true"/"false", numbers in
// JavaScript's shortest form (4.0 -> "4", 2.5 -> "2.5"), strings as is; arrays/objects throw. Malformed tags, bad
// names, mismatched or unclosed sections and a stray "{{" throw TemplateError (a RangeError). No partials or lambdas.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart template-render modules.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export class TemplateError extends RangeError { override name = "TemplateError"; }

type Node = { kind: "text" | "var" | "raw"; value: string } | { kind: "section" | "inverted"; value: string; body: Node[] };
const NAME = /^(?:\.|[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[(?:0|[1-9][0-9]*)\])*)$/;
const PART = /[A-Za-z_][A-Za-z0-9_-]*|\[\d+\]/g;
const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const isObject = (v: unknown): v is { [key: string]: Json } => typeof v === "object" && v !== null && !Array.isArray(v);
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function format(v: Json | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" || typeof v === "string") return String(v);
  throw new TemplateError("cannot render an array or object");
}

function lookup(stack: Json[], path: string): Json | undefined {
  if (path === ".") return stack[stack.length - 1];
  const [first = "", ...rest] = path.match(PART) ?? [];
  for (let s = stack.length - 1; s >= 0; s--) {
    const scope = stack[s];
    if (!isObject(scope) || !hasOwn(scope, first)) continue;
    let cur: Json | undefined = scope[first];
    for (const p of rest) {
      if (p.startsWith("[")) {
        const i = Number(p.slice(1, -1));
        cur = Array.isArray(cur) && i < cur.length ? cur[i] : undefined;
      } else cur = isObject(cur) && hasOwn(cur, p) ? cur[p] : undefined;
      if (cur === null || cur === undefined) return undefined;
    }
    return cur;
  }
  return undefined;
}

function parse(t: string): Node[] {
  const root: Node[] = [];
  const stack: { name: string; body: Node[] }[] = [{ name: "", body: root }];
  const top = (): Node[] => stack[stack.length - 1]?.body ?? root;
  let pos = 0;
  for (const m of t.matchAll(/\{\{(\{)?\s*([#^/!]?)\s*([\s\S]*?)\s*(\})?\}\}/g)) {
    const start = m.index ?? 0;
    if (start > pos) top().push({ kind: "text", value: t.slice(pos, start) });
    const [all, triple, sig = "", name = "", close] = m;
    pos = start + all.length;
    if (sig === "!") continue;
    if (Boolean(triple) !== Boolean(close) || (triple && sig)) throw new TemplateError("bad triple-brace tag");
    if (!NAME.test(name)) throw new TemplateError(`bad tag name ${JSON.stringify(name)}`);
    if (sig === "#" || sig === "^") {
      const body: Node[] = [];
      top().push({ kind: sig === "#" ? "section" : "inverted", value: name, body });
      stack.push({ name, body });
    } else if (sig === "/") {
      if (stack.length === 1 || stack[stack.length - 1]?.name !== name) throw new TemplateError("mismatched close tag");
      stack.pop();
    } else top().push({ kind: triple ? "raw" : "var", value: name });
  }
  const rest = t.slice(pos);
  if (rest.includes("{{")) throw new TemplateError("unclosed tag");
  if (rest) top().push({ kind: "text", value: rest });
  if (stack.length > 1) throw new TemplateError("unclosed section");
  return root;
}

const truthy = (v: Json | undefined): boolean =>
  !(v === null || v === undefined || v === false || v === 0 || v === "" || (Array.isArray(v) && !v.length) || (isObject(v) && !Object.keys(v).length));

function run(nodes: Node[], stack: Json[], esc: boolean, out: string[]): void {
  for (const node of nodes) {
    if (node.kind === "text") out.push(node.value);
    else if (node.kind === "var" || node.kind === "raw") {
      const s = format(lookup(stack, node.value));
      out.push(esc && node.kind === "var" ? escape(s) : s);
    } else if (node.kind === "section") {
      const v = lookup(stack, node.value);
      if (Array.isArray(v)) for (const item of v) run(node.body, [...stack, item], esc, out);
      else if (truthy(v)) run(node.body, isObject(v) ? [...stack, v] : stack, esc, out);
    } else if (node.kind === "inverted" && !truthy(lookup(stack, node.value))) run(node.body, stack, esc, out);
  }
}

/** Renders the template against data; throws TemplateError for malformed templates or array/object values. */
export function renderTemplate(template: string, data: Json, escapeHtml = true): string {
  const out: string[] = [];
  run(parse(template), [data], escapeHtml, out);
  return out.join("");
}
