// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: INI files, the common subset used by git config, PHP and Python configparser. Original source.
// parseIni returns an ordered Map of sections, each an ordered Map of string values; keys before any section go in
// section "" (always present, first). Lines are trimmed; blank lines and lines starting with ";" or "#" are skipped.
// "[name]" starts a section (trimmed, non-empty, no "]"); a repeated section continues the earlier one. "key = value"
// or "key: value" splits at the first "=" or ":". A double-quoted value is unquoted with escapes \\ \" \n \t;
// otherwise an inline comment starts at whitespace followed by ";" or "#". A bare "key" has the value "". Duplicate
// keys: last value wins, first position kept. Case is preserved; CRLF accepted. Errors throw RangeError "line N: ...".
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart ini-parse modules.

export type IniData = Map<string, Map<string, string>>;

function unquote(val: string, no: number): string {
  let buf = "";
  for (let j = 1; j < val.length; j++) {
    const c = val[j];
    if (c === "\\" && j + 1 < val.length) {
      const e = val[++j] ?? "";
      buf += e === "n" ? "\n" : e === "t" ? "\t" : e;
    } else if (c === '"') return buf;
    else buf += c;
  }
  throw new RangeError(`line ${no}: unterminated quote`);
}

/** Parses INI text into Map(section -> Map(key -> value)) with section "" first. */
export function parseIni(text: string): IniData {
  const out: IniData = new Map([["", new Map()]]);
  let cur = out.get("") as Map<string, string>;
  text.replace(/\r\n/g, "\n").split("\n").forEach((line, index) => {
    const no = index + 1, s = line.trim();
    if (!s || s[0] === ";" || s[0] === "#") return;
    if (s[0] === "[") {
      if (!s.endsWith("]")) throw new RangeError(`line ${no}: unterminated section header`);
      const name = s.slice(1, -1).trim();
      if (!name || name.includes("]")) throw new RangeError(`line ${no}: bad section name`);
      if (!out.has(name)) out.set(name, new Map());
      cur = out.get(name) as Map<string, string>;
      return;
    }
    const cuts = [s.indexOf("="), s.indexOf(":")].filter((k) => k >= 0);
    const i = cuts.length ? Math.min(...cuts) : -1;
    const key = i >= 0 ? s.slice(0, i).trim() : s;
    let val = i >= 0 ? s.slice(i + 1).trim() : "";
    if (!key) throw new RangeError(`line ${no}: empty key`);
    if (val.startsWith('"')) val = unquote(val, no);
    else {
      const c = [" ;", " #", "\t;", "\t#"].map((m) => val.indexOf(m)).filter((k) => k >= 0);
      if (c.length) val = val.slice(0, Math.min(...c)).trimEnd();
    }
    cur.set(key, val);
  });
  return out;
}

const quote = (v: string): string =>
  v === "" || v !== v.trim() || /[;#"\\\n\t]/.test(v)
    ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`
    : v;

/** Writes sections as INI text: section "" first (no header), then "[name]" blocks separated by a blank line. */
export function stringifyIni(data: ReadonlyMap<string, ReadonlyMap<string, string>>): string {
  const lines = (kv: ReadonlyMap<string, string>): string[] => [...kv].map(([k, v]) => `${k} = ${quote(v)}`);
  const blocks: string[] = [];
  const top = data.get("");
  if (top?.size) blocks.push(lines(top).join("\n"));
  for (const [name, kv] of data) if (name !== "") blocks.push([`[${name}]`, ...lines(kv)].join("\n"));
  return blocks.join("\n\n") + (blocks.length ? "\n" : "");
}
