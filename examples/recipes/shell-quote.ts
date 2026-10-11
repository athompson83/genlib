// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: POSIX shell quoting and splitting with no expansion. Original source; copy and adapt.
// shellQuote() returns '' for the empty string, the argument unchanged when it only uses A-Z a-z 0-9 @ % + = : , .
// / _ -, and otherwise wraps it in single quotes with each ' written as '\''. shellSplit() splits on unquoted space,
// tab and newline; single quotes are literal; inside double quotes a backslash escapes only $ ` " \ and newline
// (backslash-newline is removed); outside quotes a backslash escapes the next character. Adjacent parts join into
// one word, '' makes an empty word and # starts a comment only at the start of a word. Nothing is expanded ($VAR,
// * and ~ stay literal). An unterminated quote or trailing backslash throws ShellQuoteError (a SyntaxError).
// Prefer passing an argument array to the process API (execFile/spawn without a shell) over building a command line.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart shell-quote modules.

export class ShellQuoteError extends SyntaxError { override name = "ShellQuoteError"; }

const SAFE = /^[A-Za-z0-9@%+=:,./_-]+$/;

/** Quotes one argument for a POSIX shell. */
export function shellQuote(arg: string): string {
  if (arg === "") return "''";
  if (SAFE.test(arg)) return arg;
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/** Quotes each argument and joins them with single spaces. */
export function shellJoin(args: readonly string[]): string {
  return args.map(shellQuote).join(" ");
}

/** Splits a command line into words like a POSIX shell, without any expansion. */
export function shellSplit(line: string): string[] {
  const words: string[] = [];
  let cur: string | null = null;
  let i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i] ?? "";
    if (c === " " || c === "\t" || c === "\n") {
      if (cur !== null) { words.push(cur); cur = null; }
      i++;
      continue;
    }
    if (c === "#" && cur === null) {
      const j = line.indexOf("\n", i);
      i = j < 0 ? n : j;
      continue;
    }
    cur ??= "";
    if (c === "'") {
      const j = line.indexOf("'", i + 1);
      if (j < 0) throw new ShellQuoteError("unterminated single quote");
      cur += line.slice(i + 1, j);
      i = j + 1;
    } else if (c === '"') {
      i++;
      for (;;) {
        if (i >= n) throw new ShellQuoteError("unterminated double quote");
        const d = line[i] ?? "";
        if (d === '"') { i++; break; }
        const next = line[i + 1];
        if (d === "\\" && next !== undefined && '$`"\\\n'.includes(next)) {
          if (next !== "\n") cur += next;
          i += 2;
          continue;
        }
        cur += d;
        i++;
      }
    } else if (c === "\\") {
      const next = line[i + 1];
      if (next === undefined) throw new ShellQuoteError("trailing backslash");
      if (next !== "\n") cur += next;
      else if (cur === "") cur = null;
      i += 2;
    } else {
      cur += c;
      i++;
    }
  }
  if (cur !== null) words.push(cur);
  return words;
}
