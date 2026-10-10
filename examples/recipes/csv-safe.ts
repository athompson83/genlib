// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: RFC 4180 CSV writing and strict parsing with formula-injection protection. Original source; copy and adapt.
// writeCsv prefixes fields that a spreadsheet would run as a formula (= + - @ TAB CR) with "'"
// (OWASP CSV injection guidance). parseCsv never adds or removes that prefix: it returns the
// exact field text, so validate and convert each column yourself.

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]|^ | $/;

function checkRows(rows: readonly (readonly string[])[]): void {
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array of string arrays");
  rows.forEach((row, r) => {
    if (!Array.isArray(row)) throw new TypeError(`row ${r} must be an array of strings`);
    row.forEach((field, c) => {
      if (typeof field !== "string") throw new TypeError(`field ${r}:${c} must be a string`);
    });
  });
}

/** One CSV field: neutralized first (when enabled), then quoted if it holds , " CR LF or edge spaces. */
export function csvField(value: string, neutralizeFormulas = true): string {
  const text = neutralizeFormulas && FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Writes CRLF-terminated records (the last one included). An empty row list gives "". */
export function writeCsv(rows: readonly (readonly string[])[], neutralizeFormulas = true): string {
  checkRows(rows);
  return rows.map((row) => `${row.map((field) => csvField(field, neutralizeFormulas)).join(",")}\r\n`).join("");
}

export class CsvSyntaxError extends Error {
  constructor(message: string, readonly offset: number) {
    super(`${message} at offset ${offset}`);
    this.name = "CsvSyntaxError";
  }
}

/**
 * Strict RFC 4180 parse into rows of strings. Accepts CRLF or LF record ends, strips one leading
 * BOM and does not add an empty row for a final record end. Throws CsvSyntaxError on an unterminated
 * quoted field, a quote inside an unquoted field or text after a closing quote.
 */
export function parseCsv(text: string): string[][] {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const input = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  if (input.length === 0) return rows;
  for (;;) {
    let field = "";
    if (input[i] === '"') {
      const start = i;
      i++;
      for (;;) {
        if (i >= input.length) throw new CsvSyntaxError("unterminated quoted field", start);
        const ch = input[i];
        if (ch === '"') {
          if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++;
          break;
        }
        field += ch;
        i++;
      }
      const next = input[i];
      if (next !== undefined && next !== "," && next !== "\n" && !(next === "\r" && input[i + 1] === "\n")) {
        throw new CsvSyntaxError("unexpected character after closing quote", i);
      }
    } else {
      while (i < input.length) {
        const ch = input[i];
        if (ch === "," || ch === "\n" || (ch === "\r" && input[i + 1] === "\n")) break;
        if (ch === '"') throw new CsvSyntaxError("quote inside unquoted field", i);
        field += ch;
        i++;
      }
    }
    row.push(field);
    if (i >= input.length) { rows.push(row); return rows; }
    if (input[i] === ",") { i++; continue; }
    i += input[i] === "\r" ? 2 : 1;
    rows.push(row);
    row = [];
    if (i >= input.length) return rows;
  }
}
