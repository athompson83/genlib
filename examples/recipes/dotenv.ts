// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: parse .env files with optional ${NAME} / ${NAME:-default} expansion. Original source; copy and adapt.
// Blank and "#" lines are skipped; "export " is allowed; keys match [A-Za-z_][A-Za-z0-9_.]*. Unquoted values are
// trimmed and " #" starts a comment; single quotes are literal; double quotes may span lines with \n \r \t \" \\ \$.
// A later key overrides an earlier one but keeps its first position; CRLF is accepted. Expansion (unquoted and
// double-quoted values) reads earlier keys, then vars; empty counts as missing for ":-"; "\$" is never expanded.
// Errors are RangeError("line N: ..."). Same results as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and
// Dart dotenv modules (shared vectors). Parse only; never log the values, they are usually secrets.

const KEY = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\", $: "\0$" };
const REF = /(?<!\0)\$\{([A-Za-z_][A-Za-z0-9_.]*)(:-([^}]*))?\}/g;

/** Parses .env text into an ordered Map; expand resolves ${NAME} and ${NAME:-default} from earlier keys, then vars. */
export function parseDotenv(text: string, expand = false, vars: Readonly<Record<string, string>> = {}): Map<string, string> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = new Map<string, string>();
  const kinds = new Map<string, "single" | "double" | "plain">();
  let i = 0;
  while (i < lines.length) {
    const no = i + 1;
    let s = lines[i]!.trim();
    i++;
    if (!s || s.startsWith("#")) continue;
    if (s.startsWith("export ")) s = s.slice(7).trimStart();
    const eq = s.indexOf("=");
    if (eq < 0) throw new RangeError(`line ${no}: expected KEY=VALUE`);
    const key = s.slice(0, eq).trim();
    if (!KEY.test(key)) throw new RangeError(`line ${no}: invalid key ${JSON.stringify(key)}`);
    const rest = s.slice(eq + 1).trimStart();
    let val = "";
    let tail = "";
    let kind: "single" | "double" | "plain";
    if (rest.startsWith("'")) {
      const end = rest.indexOf("'", 1);
      if (end < 0) throw new RangeError(`line ${no}: unterminated single quote`);
      val = rest.slice(1, end);
      tail = rest.slice(end + 1);
      kind = "single";
    } else if (rest.startsWith('"')) {
      let buf = rest.slice(1);
      let j = 0;
      for (;;) {
        let closed = false;
        while (j < buf.length) {
          const c = buf[j]!;
          if (c === "\\" && j + 1 < buf.length) {
            const n = buf[j + 1]!;
            val += ESCAPES[n] ?? "\\" + n;
            j += 2;
            continue;
          }
          if (c === '"') { closed = true; break; }
          val += c;
          j++;
        }
        if (closed) { tail = buf.slice(j + 1); break; }
        if (i >= lines.length) throw new RangeError(`line ${no}: unterminated double quote`);
        val += "\n";
        buf = lines[i]!;
        i++;
        j = 0;
      }
      kind = "double";
    } else {
      const m = /\s#/.exec(rest);
      val = (m ? rest.slice(0, m.index) : rest).trim();
      kind = "plain";
    }
    const t = tail.trim();
    if (t && !t.startsWith("#")) throw new RangeError(`line ${no}: unexpected text after closing quote`);
    out.set(key, val);
    kinds.set(key, kind);
  }
  let result = out;
  if (expand) {
    const done = new Map<string, string>();
    for (const [k, v] of out) {
      const expanded = kinds.get(k) === "single" ? v : v.replace(REF, (_m, name: string, _d, dflt: string | undefined) => {
        const got = done.has(name) ? done.get(name) : Object.hasOwn(vars, name) ? vars[name] : undefined;
        return got ? got : dflt ?? "";
      });
      done.set(k, expanded);
    }
    result = done;
  }
  return new Map([...result].map(([k, v]) => [k, v.replaceAll("\0$", "$")]));
}
