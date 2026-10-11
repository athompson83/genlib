// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: RFC 6570 URI Template expansion, levels 1-4 (simple, +, #, ., /, ;, ? and &). Original source; copy
// and adapt. Variables map a name to a string, a string array or an ordered map (a Map, or a plain object whose keys
// are not integer-like, because JS objects list integer keys first); a missing name, null, undefined, [] and an empty
// map are undefined and skipped. Unreserved characters are kept; + and # also keep reserved characters and existing
// %XX triplets; everything else is percent-encoded as UTF-8 with uppercase hex. A prefix :n (1..9999) cuts strings
// by code point and throws on arrays and maps. Literal text copies %XX triplets as-is (RFC 6570 section 3.1), keeps
// unreserved and reserved characters and encodes the rest. Malformed templates (unclosed or stray braces, empty
// expressions, bad names or prefixes, the reserved operators = , ! @ |) throw UrlTemplateError.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart url-template modules.

export class UrlTemplateError extends RangeError { override name = "UrlTemplateError"; }

export type TemplateValue = string | readonly string[] | ReadonlyMap<string, string> | Readonly<Record<string, string>>;
export type TemplateVariables = Readonly<Record<string, TemplateValue | null | undefined>>;

type Op = readonly [first: string, sep: string, named: boolean, ifemp: string, allowReserved: boolean];
const OPS: Readonly<Record<string, Op>> = {
  "": ["", ",", false, "", false], "+": ["", ",", false, "", true], "#": ["#", ",", false, "", true],
  ".": [".", ".", false, "", false], "/": ["/", "/", false, "", false], ";": [";", ";", true, "", false],
  "?": ["?", "&", true, "=", false], "&": ["&", "&", true, "=", false],
};
const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
const RESERVED = /^[:/?#[\]@!$&'()*+,;=]$/;
const VARNAME = /^(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})(?:\.?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2}))*$/;
const VARSPEC = /^([^:*]+)(?::([0-9]+)|(\*))?$/;
const TRIPLET = /^%[0-9A-Fa-f]{2}/;
const utf8 = new TextEncoder();

function enc(s: string, allowReserved: boolean): string {
  let out = "";
  const cps = Array.from(s);
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i] ?? "";
    if (allowReserved && c === "%" && TRIPLET.test(cps.slice(i, i + 3).join(""))) {
      out += cps.slice(i, i + 3).join(""); i += 2; continue;
    }
    if (UNRESERVED.test(c) || (allowReserved && RESERVED.test(c))) out += c;
    else for (const b of utf8.encode(c)) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

function varspec(spec: string): [name: string, prefix: number | undefined, explode: boolean] {
  const m = VARSPEC.exec(spec);
  const name = m?.[1];
  if (!m || name === undefined || !VARNAME.test(name)) throw new UrlTemplateError("bad varspec: " + spec);
  let prefix: number | undefined;
  if (m[2] !== undefined) {
    prefix = Number(m[2]);
    if (m[2].startsWith("0") || prefix < 1 || prefix > 9999) throw new UrlTemplateError("bad prefix: " + spec);
  }
  return [name, prefix, m[3] !== undefined];
}

function pairs(value: TemplateValue): Array<[string, string]> | undefined {
  if (typeof value === "string" || Array.isArray(value)) return undefined;
  return value instanceof Map ? [...(value as ReadonlyMap<string, string>)] : Object.entries(value);
}

function expandExpression(expr: string, variables: TemplateVariables): string {
  if (expr === "") throw new UrlTemplateError("empty expression");
  const c0 = expr[0] ?? "";
  if ("=,!@|".includes(c0)) throw new UrlTemplateError("reserved operator: " + c0);
  const op = "+#./;?&".includes(c0) ? c0 : "";
  const [first, sep, named, ifemp, allow] = OPS[op] ?? ["", ",", false, "", false];
  const parts: string[] = [];
  const kv = (k: string, v: string): string => enc(k, allow) + (v === "" ? ifemp : "=" + enc(v, allow));
  for (const spec of expr.slice(op.length).split(",")) {
    const [name, prefix, explode] = varspec(spec);
    const value = Object.hasOwn(variables, name) ? variables[name] : undefined;
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      const v = prefix ? Array.from(value).slice(0, prefix).join("") : value;
      parts.push(named ? kv(name, v) : enc(v, allow));
      continue;
    }
    if (typeof value !== "object") throw new UrlTemplateError("unsupported value type for " + name);
    const entries = pairs(value);
    const list = entries ? undefined : (value as readonly string[]);
    if ((list ?? entries ?? []).length === 0) continue;
    if (prefix) throw new UrlTemplateError("prefix on composite value: " + name);
    if (list) {
      if (!explode) {
        const joined = list.map((x) => enc(x, allow)).join(",");
        parts.push(named ? enc(name, allow) + "=" + joined : joined);
      } else parts.push(list.map((x) => (named ? kv(name, x) : enc(x, allow))).join(sep));
    } else if (entries) {
      if (!explode) {
        const joined = entries.map(([k, v]) => enc(k, allow) + "," + enc(v, allow)).join(",");
        parts.push(named ? enc(name, allow) + "=" + joined : joined);
      } else parts.push(entries.map(([k, v]) => (named ? kv(k, v) : enc(k, allow) + "=" + enc(v, allow))).join(sep));
    }
  }
  return parts.length ? first + parts.join(sep) : "";
}

/** Expands an RFC 6570 URI Template with string, string-array and ordered-map variables. */
export function expandTemplate(template: string, variables: TemplateVariables): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const c = template[i];
    if (c === "{") {
      const j = template.indexOf("}", i);
      if (j < 0) throw new UrlTemplateError("unclosed expression");
      out += expandExpression(template.slice(i + 1, j), variables);
      i = j + 1;
    } else if (c === "}") throw new UrlTemplateError("stray }");
    else if (c === "%" && TRIPLET.test(template.slice(i, i + 3))) {
      out += template.slice(i, i + 3);
      i += 3;
    } else {
      const cp = String.fromCodePoint(template.codePointAt(i) ?? 0);
      out += enc(cp, true);
      i += cp.length;
    }
  }
  return out;
}
