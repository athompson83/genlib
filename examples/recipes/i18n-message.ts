// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: ICU-style plural/select message formatting on Intl.PluralRules. Original source; copy and adapt.
// Supported subset: {name}, {n, number}, {n, plural, =0 {...} one {# item} other {# items}},
// {n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}, {g, select, a {...} other {...}}
// and apostrophe quoting ('{' and ''). Unsupported: dates, offsets, rich text. Use a full
// ICU MessageFormat library when translators need more. Output is plain text: escape for HTML.

export type MessageValues = Record<string, string | number | boolean | null | undefined>;
type Node = string | { arg: string; type?: string; options?: Map<string, Node[]> };

class Parser {
  i = 0;
  readonly src: string;
  constructor(src: string) {
      this.src = src;}
  fail(message: string): never { throw new SyntaxError(`${message} at offset ${this.i} in message`); }

  nodes(nested: boolean): Node[] {
    const out: Node[] = [];
    let text = "";
    while (this.i < this.src.length) {
      const ch = this.src[this.i] as string;
      if (ch === "'") {
        const next = this.src[this.i + 1];
        if (next === "'") { text += "'"; this.i += 2; continue; }
        if (next === "{" || next === "}" || (nested && next === "#")) {
          const end = this.src.indexOf("'", this.i + 1);
          if (end < 0) this.fail("Unterminated quote");
          text += this.src.slice(this.i + 1, end);
          this.i = end + 1;
          continue;
        }
      }
      if (ch === "{") { if (text) out.push(text); text = ""; out.push(this.argument()); continue; }
      if (ch === "}") { if (!nested) this.fail("Unexpected }"); break; }
      if (ch === "#" && nested) { if (text) out.push(text); text = ""; out.push({ arg: "#" }); this.i++; continue; }
      text += ch;
      this.i++;
    }
    if (text) out.push(text);
    return out;
  }

  word(): string {
    const m = /^\s*([^\s{},]+)\s*/.exec(this.src.slice(this.i));
    if (!m || !m[1]) this.fail("Expected identifier");
    this.i += m[0].length;
    return m[1];
  }

  argument(): Node {
    this.i++; // {
    const arg = this.word();
    if (this.src[this.i] === "}") { this.i++; return { arg }; }
    if (this.src[this.i] !== ",") this.fail("Expected , or }");
    this.i++;
    const type = this.word();
    if (this.src[this.i] === "}") { this.i++; return { arg, type }; }
    if (this.src[this.i] !== ",") this.fail("Expected ,");
    this.i++;
    const options = new Map<string, Node[]>();
    while (true) {
      while (/\s/.test(this.src[this.i] ?? "")) this.i++;
      if (this.src[this.i] === "}") { this.i++; break; }
      const key = this.word();
      if (this.src[this.i] !== "{") this.fail("Expected { after option key");
      this.i++;
      options.set(key, this.nodes(true));
      if (this.src[this.i] !== "}") this.fail("Unterminated option");
      this.i++;
    }
    if (!options.has("other")) this.fail(`Argument "${arg}" needs an "other" option`);
    return { arg, type, options };
  }
}

const cache = new Map<string, Node[]>();
export function parseMessage(message: string): Node[] {
  let nodes = cache.get(message);
  if (!nodes) { nodes = new Parser(message).nodes(false); cache.set(message, nodes); }
  return nodes;
}

function render(nodes: Node[], values: MessageValues, locale: string, hash: number | undefined): string {
  let out = "";
  for (const node of nodes) {
    if (typeof node === "string") { out += node; continue; }
    if (node.arg === "#") { out += hash === undefined ? "#" : new Intl.NumberFormat(locale).format(hash); continue; }
    if (!(node.arg in values)) throw new Error(`Missing message value "${node.arg}"`);
    const value = values[node.arg];
    if (!node.options) {
      if (node.type !== undefined && node.type !== "number") throw new SyntaxError(`Unsupported argument type "${node.type}"`);
      out += node.type === "number" && typeof value === "number" ? new Intl.NumberFormat(locale).format(value) : String(value ?? "");
      continue;
    }
    let branch: Node[] | undefined;
    let nextHash = hash;
    if (node.type === "plural" || node.type === "selectordinal") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`"${node.arg}" must be a finite number`);
      const rules = new Intl.PluralRules(locale, { type: node.type === "plural" ? "cardinal" : "ordinal" });
      branch = node.options.get(`=${value}`) ?? node.options.get(rules.select(value));
      nextHash = value;
    } else if (node.type === "select") {
      branch = node.options.get(String(value));
    } else {
      throw new SyntaxError(`Unsupported argument type "${node.type ?? ""}"`);
    }
    out += render(branch ?? node.options.get("other") ?? [], values, locale, nextHash);
  }
  return out;
}

/** formatMessage("{n, plural, one {# file} other {# files}}", { n: 3 }, "en") === "3 files" */
export function formatMessage(message: string, values: MessageValues = {}, locale = "en"): string {
  return render(parseMessage(message), values, locale, undefined);
}

/** Simple plural-form picker when a full message is unnecessary. `forms.other` is required. */
export function pluralForm(count: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }, locale = "en"): string {
  return forms[new Intl.PluralRules(locale).select(count)] ?? forms.other;
}
