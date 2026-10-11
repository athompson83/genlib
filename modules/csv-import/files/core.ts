// SPDX-License-Identifier: Apache-2.0
// CSV import pipeline for apps, framework-neutral and server side:
//   upload -> preview with suggested header mapping -> row validation -> idempotent commit,
// with a per-row error report that is safe to open in a spreadsheet. The receiving application
// supplies persistence (ImportStore) and the code that saves one record (onRow). Imports are scoped
// to the actor's tenantId and userId: another actor's import id reads as not-found.

export type Delimiter = "," | ";" | "\t" | "|";
export const DELIMITERS: readonly Delimiter[] = [",", ";", "\t", "|"];

export type ImportErrorCode =
  | "too-large" | "too-many-rows" | "too-many-columns" | "invalid-csv" | "empty-file" | "invalid-header"
  | "invalid-mapping" | "missing-required-field" | "not-found" | "not-validated" | "commit-in-progress"
  | "already-committed" | "forbidden" | "bad-request" | "unsupported-media-type";

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly row: number | undefined;
  constructor(code: ImportErrorCode, message: string, row?: number) {
    super(message);
    this.code = code;
    this.row = row;
    this.name = "ImportError";
  }
}

// ---------------------------------------------------------------------------------------------
// Parsing (RFC 4180)

export interface ParseOptions {
  /** A fixed delimiter, or "auto" (default) to choose among , ; TAB | from the header record. */
  readonly delimiter?: Delimiter | "auto";
  /** Maximum UTF-8 size of the text. Default 5 MiB. */
  readonly maxBytes?: number;
  /** Maximum data records after the header record. Default 10,000. */
  readonly maxRows?: number;
  /** Maximum fields per record. Default 200. */
  readonly maxColumns?: number;
  /** Maximum characters per field. Default 10,000. */
  readonly maxFieldLength?: number;
}

export interface ParsedCsv {
  readonly delimiter: Delimiter;
  /** Every record, header first. Field text is exact (no trimming, no type conversion). */
  readonly records: string[][];
}

const MIB = 1024 * 1024;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Counts each candidate delimiter outside quotes in the first record; ties prefer , ; TAB | in order. */
export function detectDelimiter(text: string): Delimiter {
  const input = stripBom(text);
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (ch === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (ch === "\n" || ch === "\r") break;
    const current = counts.get(ch);
    if (current !== undefined) counts.set(ch, current + 1);
  }
  let best: Delimiter = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = counts.get(d) ?? 0;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

function positive(value: number | undefined, fallback: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1) throw new RangeError(`${name} must be a positive integer`);
  return result;
}

/**
 * Parses RFC 4180 CSV: quoted fields with "" escapes, embedded delimiters and line breaks, CRLF, LF
 * or CR record endings and a stripped UTF-8 BOM. A quote inside an unquoted field, text after a
 * closing quote and an unterminated quote are rejected as invalid-csv with the record number.
 */
export function parseCsv(text: string, options: ParseOptions = {}): ParsedCsv {
  const maxBytes = positive(options.maxBytes, 5 * MIB, "maxBytes");
  const maxRows = positive(options.maxRows, 10_000, "maxRows");
  const maxColumns = positive(options.maxColumns, 200, "maxColumns");
  const maxField = positive(options.maxFieldLength, 10_000, "maxFieldLength");
  if (typeof text !== "string") throw new ImportError("bad-request", "CSV text must be a string");
  // Cheap bound first (a UTF-16 unit is at least one UTF-8 byte), then the exact size.
  if (text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ImportError("too-large", `The file is larger than ${maxBytes} bytes`);
  }
  const input = stripBom(text);
  const requested = options.delimiter ?? "auto";
  if (requested !== "auto" && !DELIMITERS.includes(requested)) throw new RangeError("Unsupported delimiter");
  const delimiter = requested === "auto" ? detectDelimiter(input) : requested;

  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let wasQuoted = false;
  const fail = (message: string): never => { throw new ImportError("invalid-csv", `${message} (record ${records.length + 1})`, records.length + 1); };
  const endField = () => {
    if (field.length > maxField) fail(`A field is longer than ${maxField} characters`);
    row.push(field);
    if (row.length > maxColumns) throw new ImportError("too-many-columns", `A record has more than ${maxColumns} columns`, records.length + 1);
    field = "";
    wasQuoted = false;
  };
  const endRecord = () => {
    endField();
    records.push(row);
    row = [];
    if (records.length > maxRows + 1) throw new ImportError("too-many-rows", `The file has more than ${maxRows} rows`);
  };

  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (input.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
        i++;
        const next = input.charAt(i);
        if (next !== "" && next !== delimiter && next !== "\n" && next !== "\r") fail("Unexpected text after a closing quote");
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      if (field === "" && !wasQuoted) { inQuotes = true; wasQuoted = true; i++; continue; }
      fail("A quote appears inside an unquoted field");
    }
    if (ch === delimiter) { endField(); i++; continue; }
    if (ch === "\r" || ch === "\n") {
      endRecord();
      i += ch === "\r" && input.charAt(i + 1) === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (inQuotes) fail("A quoted field is not closed");
  if (field !== "" || wasQuoted || row.length > 0) endRecord();
  return { delimiter, records };
}

// ---------------------------------------------------------------------------------------------
// Fields, mapping and value parsing

export type ParseResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly code?: string; readonly message: string };

export type FieldParser = "string" | "integer" | "decimal" | "boolean" | "date" | "email" | ((raw: string) => ParseResult);

export interface ImportField {
  /** Record key passed to onRow, e.g. "email". */
  readonly key: string;
  /** Human label shown in the mapping UI and the error report. */
  readonly label: string;
  readonly required?: boolean;
  /** Other header spellings that should map to this field, e.g. ["e-mail", "email address"]. */
  readonly aliases?: readonly string[];
  /** Default "string" (trimmed). A custom function receives the trimmed, non-empty cell. */
  readonly parse?: FieldParser;
  /** Reject later rows that repeat an earlier row's value (case-insensitive for text). */
  readonly unique?: boolean;
  /** Maximum characters after trimming. Default 1,000. */
  readonly maxLength?: number;
}

/** Field key -> header name (or null when the field is not imported). */
export type Mapping = Record<string, string | null>;

export interface RowError {
  /** Record number in the file, header = 1, so the first data row is 2 (the spreadsheet row). */
  readonly row: number;
  /** Field key, or "" for a whole-row problem. */
  readonly field: string;
  readonly code: string;
  readonly message: string;
  /** The raw cell text, when the error concerns one cell. */
  readonly value?: string;
}

/** Lowercase, accents removed, everything but letters and digits removed: "E-Mail Address" -> "emailaddress". */
export function normalizeHeader(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Suggests a header for each field: a header whose normalized text equals the field key, label or
 * one of its aliases. Each header is used at most once; fields are matched in declaration order.
 */
export function suggestMapping(headers: readonly string[], fields: readonly Pick<ImportField, "key" | "label" | "aliases">[]): Mapping {
  const available = new Map<string, string>();
  for (const header of headers) {
    const key = normalizeHeader(header);
    if (key && !available.has(key)) available.set(key, header);
  }
  const mapping: Mapping = {};
  for (const field of fields) {
    mapping[field.key] = null;
    for (const name of [field.key, field.label, ...(field.aliases ?? [])]) {
      const header = available.get(normalizeHeader(name));
      if (header !== undefined) {
        mapping[field.key] = header;
        for (const [k, v] of available) if (v === header) available.delete(k);
        break;
      }
    }
  }
  return mapping;
}

const TRUE = new Set(["true", "yes", "y", "1", "on"]);
const FALSE = new Set(["false", "no", "n", "0", "off"]);
const EMAIL = /^[^\s@"(),:;<>[\]\\]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** Parses one trimmed, non-empty cell with a built-in or custom parser. */
export function parseValue(parser: FieldParser, raw: string): ParseResult {
  if (typeof parser === "function") {
    try {
      const result = parser(raw);
      if (result && typeof result === "object" && typeof result.ok === "boolean") return result;
    } catch {
      // A throwing custom parser is treated as an invalid value without exposing its message.
    }
    return { ok: false, code: "invalid", message: "Invalid value" };
  }
  switch (parser) {
    case "string":
      return { ok: true, value: raw };
    case "integer": {
      const value = Number(raw);
      return /^[+-]?\d{1,16}$/.test(raw) && Number.isSafeInteger(value)
        ? { ok: true, value }
        : { ok: false, code: "invalid-integer", message: "Expected a whole number" };
    }
    case "decimal": {
      const value = Number(raw);
      return raw.length <= 32 && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw) && Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, code: "invalid-decimal", message: "Expected a number such as 12.50" };
    }
    case "boolean": {
      const lower = raw.toLowerCase();
      if (TRUE.has(lower)) return { ok: true, value: true };
      if (FALSE.has(lower)) return { ok: true, value: false };
      return { ok: false, code: "invalid-boolean", message: "Expected yes/no, true/false or 1/0" };
    }
    case "date": {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (match) {
        const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
        const date = new Date(Date.UTC(y, m - 1, d));
        if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) return { ok: true, value: raw };
      }
      return { ok: false, code: "invalid-date", message: "Expected a date as YYYY-MM-DD" };
    }
    case "email": {
      const at = raw.lastIndexOf("@");
      return raw.length <= 254 && EMAIL.test(raw)
        ? { ok: true, value: raw.slice(0, at) + "@" + raw.slice(at + 1).toLowerCase() }
        : { ok: false, code: "invalid-email", message: "Expected an email address" };
    }
    default:
      return { ok: false, code: "invalid", message: "Unknown parser" };
  }
}

// ---------------------------------------------------------------------------------------------
// Store

export type ImportStatus = "staged" | "validated" | "committing" | "committed";

export interface StagedRow {
  /** Record number in the file (header = 1). */
  readonly row: number;
  readonly cells: readonly string[];
}

export interface CommitResult {
  readonly importId: string;
  readonly total: number;
  readonly committed: number;
  readonly failed: number;
  /** Rows left out because they failed validation. */
  readonly skipped: number;
  readonly committedAt: number;
}

export interface ImportRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly status: ImportStatus;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly delimiter: Delimiter;
  readonly headers: readonly string[];
  readonly rows: readonly StagedRow[];
  readonly mapping?: Mapping;
  readonly errors?: readonly RowError[];
  readonly errorCount?: number;
  readonly progress?: { readonly committed: number; readonly failed: number };
  readonly result?: CommitResult;
}

export type ImportPatch = Partial<Pick<ImportRecord, "status" | "mapping" | "errors" | "errorCount" | "progress" | "result">>;

export interface ImportStore {
  insert(record: ImportRecord): Promise<void>;
  get(id: string): Promise<ImportRecord | null>;
  /**
   * Atomically applies `patch` only while the stored status is `from` and returns true, or returns
   * false when the status changed (another request won): UPDATE ... WHERE id = $1 AND status = $2.
   */
  update(id: string, from: ImportStatus, patch: ImportPatch): Promise<boolean>;
  delete(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Importer

export interface ImportActor {
  readonly tenantId: string;
  readonly userId: string;
}

export interface ImporterOptions {
  readonly fields: readonly ImportField[];
  readonly store: ImportStore;
  readonly now?: () => number;
  readonly newId?: () => string;
  /** Parser limits (and an optional fixed delimiter) applied to every upload. */
  readonly limits?: ParseOptions;
  /** How long staged rows and the commit result are kept. Default 24 hours; 1 minute to 7 days. */
  readonly ttlMs?: number;
  /** Data rows returned by preview. Default 5. */
  readonly sampleSize?: number;
  /** Row errors kept for the report. Counts stay exact beyond it. Default 10,000. */
  readonly maxStoredErrors?: number;
  /** Row errors returned by validate. Default 100. */
  readonly maxReturnedErrors?: number;
}

export interface PreviewResult {
  readonly importId: string;
  readonly delimiter: Delimiter;
  readonly headers: readonly string[];
  readonly mapping: Mapping;
  readonly sampleRows: readonly (readonly string[])[];
  readonly rowCount: number;
}

export interface Duplicate {
  readonly field: string;
  readonly value: string;
  readonly rows: readonly number[];
}

export interface ValidationResult {
  readonly importId: string;
  readonly total: number;
  readonly valid: number;
  readonly invalid: number;
  /** The first maxReturnedErrors row errors; errorCount is exact. */
  readonly errors: readonly RowError[];
  readonly errorCount: number;
  readonly duplicates: readonly Duplicate[];
}

export type RowRecord = Record<string, unknown>;

export interface CommitOptions {
  /** Saves one valid record. Throw to record a row error and continue with the next rows. */
  readonly onRow: (record: RowRecord, rowNumber: number, context: { readonly importId: string }) => Promise<void>;
  /** Rows saved concurrently per batch; progress is stored after each batch. Default 1 (sequential), max 100. */
  readonly batchSize?: number;
}

const ID_PATTERN = /^[\w-]{1,64}$/;
const KEY_PATTERN = /^[A-Za-z_][\w.-]{0,63}$/;
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: string): string {
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with CRLF endings; every cell starting with = + - @ TAB or CR gets a leading '. */
export function toSafeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",") + "\r\n").join("");
}

interface Evaluation {
  records: Map<number, RowRecord>;
  errors: RowError[];
  invalidRows: Set<number>;
  duplicates: Duplicate[];
}

export function createImporter(options: ImporterOptions) {
  const fields = options.fields;
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 200) throw new RangeError("Declare between 1 and 200 fields");
  const keys = new Set<string>();
  for (const field of fields) {
    if (!KEY_PATTERN.test(field.key) || keys.has(field.key)) throw new RangeError(`Invalid or duplicate field key: ${String(field.key)}`);
    if (typeof field.label !== "string" || field.label.length === 0) throw new RangeError(`Field ${field.key} needs a label`);
    keys.add(field.key);
  }
  const { store } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 7 * 24 * 60 * 60 * 1000) throw new RangeError("ttlMs must be 1 minute to 7 days");
  const sampleSize = positive(options.sampleSize, 5, "sampleSize");
  const maxStoredErrors = positive(options.maxStoredErrors, 10_000, "maxStoredErrors");
  const maxReturnedErrors = positive(options.maxReturnedErrors, 100, "maxReturnedErrors");
  const limits = options.limits ?? {};

  function checkActor(actor: ImportActor): void {
    if (!actor || typeof actor.tenantId !== "string" || !actor.tenantId || typeof actor.userId !== "string" || !actor.userId) {
      throw new ImportError("forbidden", "A signed-in user with a tenant is required");
    }
  }

  async function load(actor: ImportActor, importId: string): Promise<ImportRecord> {
    checkActor(actor);
    if (typeof importId !== "string" || !ID_PATTERN.test(importId)) throw new ImportError("not-found", "Import not found");
    const record = await store.get(importId);
    // Another actor's import is indistinguishable from a missing one.
    if (!record || record.tenantId !== actor.tenantId || record.userId !== actor.userId || now() >= record.expiresAt) {
      throw new ImportError("not-found", "Import not found");
    }
    return record;
  }

  function checkMapping(record: ImportRecord, mapping: unknown): Mapping {
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new ImportError("invalid-mapping", "Mapping must be an object of field key to header");
    const result: Mapping = {};
    const used = new Set<string>();
    for (const [key, header] of Object.entries(mapping as Record<string, unknown>)) {
      if (!keys.has(key)) throw new ImportError("invalid-mapping", `Unknown field: ${key.slice(0, 64)}`);
      if (header === null || header === undefined || header === "") continue;
      if (typeof header !== "string" || !record.headers.includes(header)) throw new ImportError("invalid-mapping", `No column named ${String(header).slice(0, 64)}`);
      if (used.has(header)) throw new ImportError("invalid-mapping", `Column ${header} is mapped to more than one field`);
      used.add(header);
      result[key] = header;
    }
    const missing = fields.filter((field) => field.required && !result[field.key]);
    if (missing.length > 0) throw new ImportError("missing-required-field", `Choose a column for: ${missing.map((field) => field.label).join(", ")}`);
    for (const field of fields) if (!(field.key in result)) result[field.key] = null;
    return result;
  }

  function evaluate(record: ImportRecord, mapping: Mapping): Evaluation {
    const columns = fields.map((field) => {
      const header = mapping[field.key];
      return { field, index: header ? record.headers.indexOf(header) : -1 };
    });
    const records = new Map<number, RowRecord>();
    const errors: RowError[] = [];
    const invalidRows = new Set<number>();
    const seen = new Map<string, Map<string, number[]>>();
    for (const field of fields) if (field.unique) seen.set(field.key, new Map());
    for (const staged of record.rows) {
      const out: RowRecord = {};
      let ok = true;
      const add = (error: RowError) => { ok = false; errors.push(error); };
      const extra = staged.cells.slice(record.headers.length);
      if (extra.some((cell) => cell.trim() !== "")) {
        add({ row: staged.row, field: "", code: "extra-columns", message: "The row has more cells than the header" });
      }
      for (const { field, index } of columns) {
        const raw = index >= 0 ? staged.cells[index] ?? "" : "";
        const value = raw.trim();
        if (value === "") {
          if (field.required) add({ row: staged.row, field: field.key, code: "required", message: `${field.label} is required`, value: raw });
          out[field.key] = null;
          continue;
        }
        const maxLength = field.maxLength ?? 1000;
        if (value.length > maxLength) {
          add({ row: staged.row, field: field.key, code: "too-long", message: `${field.label} is longer than ${maxLength} characters`, value: raw.slice(0, 200) });
          continue;
        }
        const parsed = parseValue(field.parse ?? "string", value);
        if (!parsed.ok) {
          add({ row: staged.row, field: field.key, code: parsed.code ?? "invalid", message: `${field.label}: ${parsed.message}`, value: raw });
          continue;
        }
        out[field.key] = parsed.value;
        const bucket = seen.get(field.key);
        if (bucket) {
          const key = typeof parsed.value === "string" ? parsed.value.toLowerCase() : JSON.stringify(parsed.value);
          const rows = bucket.get(key);
          if (rows) {
            rows.push(staged.row);
            add({ row: staged.row, field: field.key, code: "duplicate", message: `${field.label} repeats row ${rows[0]}`, value: raw });
          } else {
            bucket.set(key, [staged.row]);
          }
        }
      }
      if (ok) records.set(staged.row, out);
      else invalidRows.add(staged.row);
    }
    const duplicates: Duplicate[] = [];
    for (const [field, bucket] of seen) {
      for (const [value, rows] of bucket) if (rows.length > 1) duplicates.push({ field, value, rows });
    }
    return { records, errors, invalidRows, duplicates };
  }

  async function failForStatus(id: string): Promise<never> {
    const current = await store.get(id);
    if (current?.status === "committing") throw new ImportError("commit-in-progress", "This import is being committed");
    if (current?.status === "committed") throw new ImportError("already-committed", "This import was already committed");
    throw new ImportError("not-found", "Import not found");
  }

  return {
    /** Parses and stages an upload, and suggests a mapping. Nothing is saved to your records yet. */
    async preview(actor: ImportActor, text: string): Promise<PreviewResult> {
      checkActor(actor);
      const { delimiter, records } = parseCsv(text, limits);
      const [headerRecord, ...dataRecords] = records;
      if (!headerRecord || headerRecord.every((cell) => cell.trim() === "")) throw new ImportError("empty-file", "The file has no header row");
      const headers = headerRecord.map((cell) => cell.trim());
      const names = new Set<string>();
      headers.forEach((header, index) => {
        if (!header) throw new ImportError("invalid-header", `Column ${index + 1} has no header`);
        if (names.has(header.toLowerCase())) throw new ImportError("invalid-header", `Two columns are named ${header}`);
        names.add(header.toLowerCase());
      });
      const rows: StagedRow[] = [];
      dataRecords.forEach((cells, index) => {
        if (cells.some((cell) => cell.trim() !== "")) rows.push({ row: index + 2, cells });
      });
      if (rows.length === 0) throw new ImportError("empty-file", "The file has no data rows");
      const at = now();
      const id = newId();
      const mapping = suggestMapping(headers, fields);
      await store.insert({
        id, tenantId: actor.tenantId, userId: actor.userId, status: "staged", createdAt: at, expiresAt: at + ttlMs,
        delimiter, headers, rows,
      });
      return { importId: id, delimiter, headers, mapping, sampleRows: rows.slice(0, sampleSize).map((row) => row.cells), rowCount: rows.length };
    },

    /** Checks every row against the mapping and stores the mapping for commit. May be repeated until commit. */
    async validate(actor: ImportActor, importId: string, mapping: unknown): Promise<ValidationResult> {
      const record = await load(actor, importId);
      if (record.status !== "staged" && record.status !== "validated") await failForStatus(record.id);
      const checked = checkMapping(record, mapping);
      const result = evaluate(record, checked);
      const updated = await store.update(record.id, record.status, {
        status: "validated", mapping: checked, errors: result.errors.slice(0, maxStoredErrors), errorCount: result.errors.length,
      });
      if (!updated) await failForStatus(record.id);
      return {
        importId: record.id, total: record.rows.length, valid: result.records.size, invalid: result.invalidRows.size,
        errors: result.errors.slice(0, maxReturnedErrors), errorCount: result.errors.length, duplicates: result.duplicates,
      };
    },

    /**
     * Saves each valid row through onRow, exactly once per import: a repeated commit returns the first
     * result without calling onRow again, and a concurrent one fails with commit-in-progress. A row
     * whose onRow throws is recorded as a row error and the commit continues.
     */
    async commit(actor: ImportActor, importId: string, commitOptions: CommitOptions): Promise<CommitResult> {
      const record = await load(actor, importId);
      if (record.status === "committed" && record.result) return record.result;
      if (record.status === "staged") throw new ImportError("not-validated", "Validate the mapping before committing");
      if (typeof commitOptions?.onRow !== "function") throw new RangeError("commit needs an onRow function");
      const batchSize = positive(commitOptions.batchSize, 1, "batchSize");
      if (batchSize > 100) throw new RangeError("batchSize must be at most 100");
      if (record.status !== "validated" || !record.mapping) return failOrResult(record.id);
      if (!(await store.update(record.id, "validated", { status: "committing", progress: { committed: 0, failed: 0 } }))) {
        return failOrResult(record.id);
      }
      const evaluation = evaluate(record, record.mapping);
      const rowErrors: RowError[] = [...evaluation.errors];
      const valid = [...evaluation.records.entries()];
      let committed = 0;
      let failed = 0;
      for (let start = 0; start < valid.length; start += batchSize) {
        const batch = valid.slice(start, start + batchSize);
        const settled = await Promise.allSettled(batch.map(([row, values]) => commitOptions.onRow(values, row, { importId: record.id })));
        settled.forEach((outcome, index) => {
          if (outcome.status === "fulfilled") { committed++; return; }
          failed++;
          const row = batch[index]?.[0] ?? 0;
          // Only an ImportError's message reaches the report; other errors may carry internals.
          const reason: unknown = outcome.reason;
          const message = reason instanceof ImportError ? reason.message : "The row could not be saved";
          rowErrors.push({ row, field: "", code: "row-failed", message });
        });
        await store.update(record.id, "committing", { progress: { committed, failed } });
      }
      rowErrors.sort((a, b) => a.row - b.row);
      const result: CommitResult = {
        importId: record.id, total: record.rows.length, committed, failed, skipped: evaluation.invalidRows.size, committedAt: now(),
      };
      await store.update(record.id, "committing", {
        status: "committed", result, errors: rowErrors.slice(0, maxStoredErrors), errorCount: rowErrors.length,
      });
      return result;
    },

    /** Discards a staged or committed import and its staged rows. Refused while a commit runs. */
    async cancel(actor: ImportActor, importId: string): Promise<void> {
      const record = await load(actor, importId);
      if (record.status === "committing") throw new ImportError("commit-in-progress", "This import is being committed");
      await store.delete(record.id);
    },

    /**
     * The row errors as CSV (row, field, column, code, message, value) for download. Cells that a
     * spreadsheet would run as a formula are prefixed with ' (CSV injection guard).
     */
    async exportErrors(actor: ImportActor, importId: string): Promise<string> {
      const record = await load(actor, importId);
      const labels = new Map(fields.map((field) => [field.key, field.label]));
      const rows: string[][] = [["row", "field", "column", "code", "message", "value"]];
      for (const error of record.errors ?? []) {
        rows.push([
          String(error.row), labels.get(error.field) ?? error.field, (error.field && record.mapping?.[error.field]) || "",
          error.code, error.message, error.value ?? "",
        ]);
      }
      return toSafeCsv(rows);
    },
  };

  async function failOrResult(id: string): Promise<CommitResult> {
    const current = await store.get(id);
    if (current?.status === "committed" && current.result) return current.result;
    if (current?.status === "staged") throw new ImportError("not-validated", "Validate the mapping before committing");
    return failForStatus(id);
  }
}

export type Importer = ReturnType<typeof createImporter>;
