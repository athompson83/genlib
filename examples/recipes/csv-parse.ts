// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: RFC 4180 CSV parsing with quoted fields and header mapping. Original source; copy and adapt.
// Parses into strings only; validate and convert each column yourself. Values that start
// with = + - @ are formulas if re-exported to a spreadsheet; escape them on export.

export interface CsvOptions {
  delimiter?: string;
  /** Throw on a quote inside an unquoted field (default true). */
  strict?: boolean;
  maxRows?: number;
  maxFieldLength?: number;
}

export class CsvError extends Error {
  constructor(message: string, readonly row: number) { super(`${message} (row ${row})`); this.name = "CsvError"; }
}

/** Returns rows of fields. Handles "", embedded delimiters/newlines, CRLF/LF/CR and a UTF-8 BOM. */
export function parseCsv(text: string, options: CsvOptions = {}): string[][] {
  const delimiter = options.delimiter ?? ",";
  const strict = options.strict ?? true;
  const maxRows = options.maxRows ?? 1_000_000;
  const maxField = options.maxFieldLength ?? 1_000_000;
  if (delimiter.length !== 1 || delimiter === '"' || delimiter === "\n" || delimiter === "\r") throw new RangeError("Invalid delimiter");
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  let i = 0;
  const endField = () => {
    if (field.length > maxField) throw new CsvError("Field too long", rows.length + 1);
    row.push(field);
    field = "";
    wasQuoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    if (rows.length > maxRows) throw new CsvError("Too many rows", rows.length);
  };
  while (i < input.length) {
    const ch = input[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false;
        i++;
        const next = input[i];
        if (strict && next !== undefined && next !== delimiter && next !== "\n" && next !== "\r") throw new CsvError("Unexpected character after closing quote", rows.length + 1);
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      if (field === "" && !wasQuoted) { quoted = true; wasQuoted = true; i++; continue; }
      if (strict) throw new CsvError("Quote inside unquoted field", rows.length + 1);
      field += ch;
      i++;
      continue;
    }
    if (ch === delimiter) { endField(); i++; continue; }
    if (ch === "\r" || ch === "\n") {
      endRow();
      i += ch === "\r" && input[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (quoted) throw new CsvError("Unterminated quoted field", rows.length + 1);
  if (field !== "" || wasQuoted || row.length > 0) endRow(); // no phantom row after a final newline
  return rows;
}

/** Maps rows to objects using the first row as headers. Rejects blank/duplicate headers and ragged rows. */
export function csvToObjects(rows: readonly string[][], options: { trimHeaders?: boolean; allowRagged?: boolean } = {}): Array<Record<string, string>> {
  const [head, ...body] = rows;
  if (!head) return [];
  const headers = head.map((h) => (options.trimHeaders === false ? h : h.trim()));
  const seen = new Set<string>();
  for (const h of headers) {
    if (!h || seen.has(h) || h === "__proto__") throw new CsvError(`Blank, duplicate or reserved header "${h}"`, 1);
    seen.add(h);
  }
  return body.map((fields, index) => {
    if (!options.allowRagged && fields.length !== headers.length) throw new CsvError(`Expected ${headers.length} fields, found ${fields.length}`, index + 2);
    const record: Record<string, string> = {};
    headers.forEach((h, col) => { record[h] = fields[col] ?? ""; });
    return record;
  });
}
