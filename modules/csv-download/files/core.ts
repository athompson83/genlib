// SPDX-License-Identifier: Apache-2.0
// CSV export safe for Excel, framework-neutral. Rows come from an injected, tenant-scoped RowSource read page by
// page with a cursor, pass an optional per-row authorize hook, and stream out as RFC 4180 CSV (CRLF records,
// quoting) through a pull-based ReadableStream, so memory stays at about one page and an unread download stops
// fetching. String cells that a spreadsheet would run as a formula (= + - @ TAB CR) get a leading apostrophe.
// The file is UTF-8 with a byte-order mark by default so Excel shows non-ASCII text correctly. Row and byte caps
// end the export with limit-exceeded (or a reported truncation) instead of exhausting memory.

export interface ExportRequester {
  readonly tenantId: string;
  readonly userId: string;
  /** Optional roles from your session, passed through to your hooks. */
  readonly roles?: readonly string[];
}

export interface ExportColumn<Row> {
  /** Stable key the client selects, e.g. "email". Letters, digits, _ . and -. */
  readonly key: string;
  /** Header text written in the first record. */
  readonly header: string;
  /** Cell value: string, number, bigint, boolean, Date, null or undefined. */
  readonly value: (row: Row) => unknown;
}

export interface RowQuery {
  /** null for the first page, then the previous page's nextCursor. */
  readonly cursor: string | null;
  /** Maximum rows to return in this page. */
  readonly limit: number;
  /** The request's filter, unvalidated by this module: treat it as client input. */
  readonly filter?: unknown;
  readonly signal?: AbortSignal;
}

export interface RowPage<Row> {
  readonly rows: readonly Row[];
  /** Cursor for the next page, or null when this was the last page. */
  readonly nextCursor: string | null;
}

export interface RowSource<Row> {
  /**
   * One page of rows visible to `requester`, scoped by requester.tenantId (and user, where your rules need it).
   * Use keyset pagination (WHERE id > cursor ORDER BY id LIMIT limit) so pages stay stable and cheap.
   */
  fetchPage(requester: ExportRequester, query: RowQuery): Promise<RowPage<Row>>;
}

export interface ExportRequest {
  /** Column keys to export, in order. Defaults to `defaultColumns` (or every declared column). */
  readonly columns?: readonly string[];
  /** Passed to the source unchanged. */
  readonly filter?: unknown;
  /** Suggested download name; it is sanitized and given a .csv extension. */
  readonly filename?: string;
}

export interface ExportSummary {
  readonly ok: boolean;
  readonly error?: CsvExportCode;
  readonly tenantId: string;
  readonly userId: string;
  readonly columns: readonly string[];
  /** Data records written (the header is not counted). */
  readonly rows: number;
  /** Rows the source returned that authorize or tenantOf refused. */
  readonly denied: number;
  readonly bytes: number;
  readonly pages: number;
  readonly truncated: boolean;
  readonly startedAt: number;
  readonly finishedAt: number;
}

export interface ExportLog {
  record(summary: ExportSummary): Promise<void>;
}

export interface CsvExporterOptions<Row> {
  /** Every column a client may select. Nothing outside this list is ever written. */
  readonly columns: readonly ExportColumn<Row>[];
  readonly source: RowSource<Row>;
  /** Columns used when the request names none. Default: every declared column. */
  readonly defaultColumns?: readonly string[];
  /** Whole-export permission check, run before any row is fetched. Return false to refuse with forbidden. */
  readonly canExport?: (requester: ExportRequester, request: ExportRequest) => boolean | Promise<boolean>;
  /** Column-level permission. Selecting a refused column fails with forbidden; defaults skip refused columns. */
  readonly canReadColumn?: (requester: ExportRequester, key: string) => boolean;
  /** Per-row permission. Rows it refuses are skipped and counted in `denied`. */
  readonly authorize?: (requester: ExportRequester, row: Row) => boolean | Promise<boolean>;
  /** Defense in depth: rows whose tenant differs from the requester's are skipped and counted in `denied`. */
  readonly tenantOf?: (row: Row) => string;
  /** Prefix formula-like string cells. Default true. */
  readonly neutralizeFormulas?: boolean;
  /** Leading characters that trigger neutralization. Default = + - @ TAB CR. */
  readonly formulaTriggers?: readonly string[];
  /** Text placed before a formula-like cell. Default "'". */
  readonly formulaEscape?: string;
  /** Start the file with a UTF-8 byte-order mark (EF BB BF) for Excel. Default true. */
  readonly bom?: boolean;
  /** Record terminator. Default CRLF (RFC 4180). */
  readonly lineEnding?: "\r\n" | "\n";
  /** Write a header record. Default true. */
  readonly header?: boolean;
  /** Most data records per export. Default 100,000. */
  readonly maxRows?: number;
  /** Most bytes per export, including the BOM and header. Default 50 MiB. */
  readonly maxBytes?: number;
  /** "error" (default) errors the stream with limit-exceeded; "truncate" ends the file early and sets truncated. */
  readonly onLimit?: "error" | "truncate";
  /** Rows requested per page. Default 500, at most 10,000. */
  readonly pageSize?: number;
  /** Stream queue size in bytes before fetching pauses. Default 64 KiB. */
  readonly highWaterMark?: number;
  /** Default download name. Default "export.csv". */
  readonly filename?: string;
  /** Receives one summary per export (completed, failed or cancelled). Failures to record are ignored. */
  readonly log?: ExportLog;
  /** Called once per export after `log`. */
  readonly onFinish?: (summary: ExportSummary) => void;
  readonly now?: () => number;
}

export interface CsvExport {
  readonly stream: ReadableStream<Uint8Array>;
  readonly filename: string;
  /** content-type, content-disposition, cache-control and x-content-type-options for the download. */
  readonly headers: Readonly<Record<string, string>>;
  readonly columns: readonly string[];
}

export interface CsvExporter<Row> {
  exportCsv(requester: ExportRequester, request?: ExportRequest, options?: { readonly signal?: AbortSignal }): Promise<CsvExport>;
  /** Columns this requester may select, in declaration order. */
  columnsFor(requester: ExportRequester): { key: string; header: string }[];
  /** Default column keys this requester gets when selecting none. */
  defaultsFor(requester: ExportRequester): string[];
  readonly declared: readonly ExportColumn<Row>[];
}

export type CsvExportCode =
  | "forbidden" | "invalid-columns" | "invalid-request" | "invalid-cell" | "limit-exceeded" | "source-error" | "cancelled";

export class CsvExportError extends Error {
  readonly code: CsvExportCode;
  constructor(code: CsvExportCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = "CsvExportError";
  }
}

export const DEFAULT_FORMULA_TRIGGERS: readonly string[] = ["=", "+", "-", "@", "\t", "\r"];
const NEEDS_QUOTES = /[",\r\n]|^ | $/;
const KEY = /^[A-Za-z0-9_.-]{1,64}$/;
const BOM_BYTES = Uint8Array.of(0xef, 0xbb, 0xbf);
const MAX_PAGE = 10_000;
const MAX_EMPTY_PAGES = 100;

export interface CellOptions {
  readonly neutralizeFormulas?: boolean;
  readonly formulaTriggers?: readonly string[];
  readonly formulaEscape?: string;
}

/** One text field: neutralized first (when enabled), then quoted if it holds , " CR LF or edge spaces. */
export function csvField(text: string, options: CellOptions = {}): string {
  return quote(formatCell(text, options));
}

/**
 * Converts a cell value to its field text. Strings are neutralized when formula-like; numbers, bigints, booleans
 * and dates are typed values a spreadsheet reads as data, so a negative number stays "-5". null, undefined,
 * NaN, infinities and invalid dates become "". Objects and functions throw invalid-cell rather than leak
 * "[object Object]" or internal fields.
 */
export function formatCell(value: unknown, options: CellOptions = {}): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const triggers = options.formulaTriggers ?? DEFAULT_FORMULA_TRIGGERS;
    return (options.neutralizeFormulas ?? true) && triggers.some((t) => value.startsWith(t)) ? `${options.formulaEscape ?? "'"}${value}` : value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  throw new CsvExportError("invalid-cell", "A cell value must be a string, number, bigint, boolean, Date or null");
}

function quote(text: string): string {
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A download name: path separators, quotes, control characters, header delimiters and characters Windows refuses
 * become "_", leading/trailing dots and spaces are trimmed, ".csv" is ensured, and the result is at most 150
 * characters. Empty results become "export.csv".
 */
export function safeCsvFilename(name: string): string {
  let out = "";
  for (const c of String(name)) {
    const cp = c.codePointAt(0) ?? 0;
    out += cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp < 0xa0) || '/\\";:<>|?*'.includes(c) ? "_" : c;
  }
  out = out.replace(/^[ .]+|[ .]+$/g, "");
  if (out.toLowerCase().endsWith(".csv")) out = out.slice(0, -4).replace(/[ .]+$/g, "");
  if (!out) return "export.csv";
  const chars = Array.from(out);
  return `${chars.slice(0, 146).join("")}.csv`;
}

const ATTR_CHAR = /^[A-Za-z0-9!#$&+\-.^_`|~]$/;
const hex = (byte: number): string => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;

/** RFC 6266 attachment header: filename="ascii" always, plus filename*=UTF-8''... (RFC 8187) for non-ASCII names. */
export function contentDisposition(filename: string): string {
  const name = safeCsvFilename(filename);
  if (!/[^\x20-\x7e]/.test(name)) return `attachment; filename="${name}"`;
  const encoder = new TextEncoder();
  let fallback = "";
  let encoded = "";
  for (const c of name) {
    const cp = c.codePointAt(0) ?? 0;
    fallback += cp >= 0x20 && cp < 0x7f ? c : "_";
    encoded += ATTR_CHAR.test(c) ? c : Array.from(encoder.encode(c), hex).join("");
  }
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function downloadHeaders(filename: string): Record<string, string> {
  return {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": contentDisposition(filename),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
}

function positiveInt(value: number | undefined, fallback: number, name: string, max = Number.MAX_SAFE_INTEGER): number {
  const out = value ?? fallback;
  if (!Number.isSafeInteger(out) || out < 1 || out > max) throw new RangeError(`${name} must be an integer from 1 to ${max}`);
  return out;
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;

export function createCsvExporter<Row>(options: CsvExporterOptions<Row>): CsvExporter<Row> {
  const declared = options.columns;
  if (!Array.isArray(declared) || declared.length === 0) throw new RangeError("Declare at least one column");
  const byKey = new Map<string, ExportColumn<Row>>();
  for (const column of declared) {
    if (!KEY.test(column.key)) throw new RangeError(`Invalid column key ${JSON.stringify(column.key)}`);
    if (byKey.has(column.key)) throw new RangeError(`Duplicate column key ${column.key}`);
    if (typeof column.value !== "function") throw new RangeError(`Column ${column.key} needs a value function`);
    byKey.set(column.key, column);
  }
  const defaults = options.defaultColumns ?? declared.map((c) => c.key);
  for (const key of defaults) if (!byKey.has(key)) throw new RangeError(`Unknown default column ${key}`);
  const triggers = options.formulaTriggers ?? DEFAULT_FORMULA_TRIGGERS;
  if (triggers.some((t) => typeof t !== "string" || t.length === 0)) throw new RangeError("Formula triggers must be non-empty strings");
  const cell: CellOptions = { neutralizeFormulas: options.neutralizeFormulas ?? true, formulaTriggers: triggers, formulaEscape: options.formulaEscape ?? "'" };
  const eol = options.lineEnding ?? "\r\n";
  if (eol !== "\r\n" && eol !== "\n") throw new RangeError("lineEnding must be CRLF or LF");
  const bom = options.bom ?? true;
  const writeHeader = options.header ?? true;
  const maxRows = positiveInt(options.maxRows, 100_000, "maxRows");
  const maxBytes = positiveInt(options.maxBytes, 50 * 1024 * 1024, "maxBytes");
  if (maxBytes < 16) throw new RangeError("maxBytes must be at least 16");
  const pageSize = positiveInt(options.pageSize, 500, "pageSize", MAX_PAGE);
  const highWaterMark = positiveInt(options.highWaterMark, 64 * 1024, "highWaterMark");
  const onLimit = options.onLimit ?? "error";
  const now = options.now ?? Date.now;
  const encoder = new TextEncoder();

  const readable = (requester: ExportRequester, key: string): boolean => options.canReadColumn?.(requester, key) ?? true;

  function selectColumns(requester: ExportRequester, requested: readonly string[] | undefined): ExportColumn<Row>[] {
    if (requested === undefined) {
      const keys = defaults.filter((key) => readable(requester, key));
      if (keys.length === 0) throw new CsvExportError("forbidden", "No exportable columns");
      return keys.map((key) => byKey.get(key) as ExportColumn<Row>);
    }
    if (!Array.isArray(requested) || requested.length === 0 || requested.length > declared.length) {
      throw new CsvExportError("invalid-columns", "Select between one column and every declared column");
    }
    const seen = new Set<string>();
    const out: ExportColumn<Row>[] = [];
    for (const key of requested) {
      const column = typeof key === "string" ? byKey.get(key) : undefined;
      if (!column || seen.has(key)) throw new CsvExportError("invalid-columns", "Unknown or repeated column");
      seen.add(key);
      out.push(column);
    }
    for (const column of out) if (!readable(requester, column.key)) throw new CsvExportError("forbidden", "A selected column is not available to you");
    return out;
  }

  function record(fields: readonly string[]): string {
    // A lone empty field is written as "" so the record is not a blank line that readers may skip.
    if (fields.length === 1 && fields[0] === "") return `""${eol}`;
    return `${fields.map(quote).join(",")}${eol}`;
  }

  async function fetchPage(requester: ExportRequester, query: RowQuery): Promise<RowPage<Row>> {
    let page: RowPage<Row>;
    try {
      page = await options.source.fetchPage(requester, query);
    } catch (error) {
      if (error instanceof CsvExportError) throw error;
      throw new CsvExportError("source-error", "The row source failed", { cause: error });
    }
    if (!page || !Array.isArray(page.rows) || (page.nextCursor !== null && typeof page.nextCursor !== "string")) {
      throw new CsvExportError("source-error", "The row source returned a malformed page");
    }
    if (page.rows.length > query.limit) throw new CsvExportError("source-error", "The row source returned more rows than requested");
    if (page.nextCursor !== null && page.nextCursor === query.cursor) throw new CsvExportError("source-error", "The row source did not advance its cursor");
    return page;
  }

  async function exportCsv(requester: ExportRequester, request: ExportRequest = {}, run: { readonly signal?: AbortSignal } = {}): Promise<CsvExport> {
    if (!requester || !nonEmpty(requester.tenantId) || !nonEmpty(requester.userId)) {
      throw new CsvExportError("invalid-request", "A signed-in requester with a tenant is required");
    }
    // Copy so a caller mutating its object mid-export cannot change the scope.
    const who: ExportRequester = Object.freeze({ tenantId: requester.tenantId, userId: requester.userId, ...(requester.roles ? { roles: [...requester.roles] } : {}) });
    const columns = selectColumns(who, request.columns);
    if (options.canExport && !(await options.canExport(who, request))) throw new CsvExportError("forbidden", "You may not export these rows");
    const filename = safeCsvFilename(request.filename ?? options.filename ?? "export.csv");
    const keys = columns.map((c) => c.key);
    const signal = run.signal;
    if (signal?.aborted) throw new CsvExportError("cancelled", "The export was cancelled");
    const query = (cursor: string | null): RowQuery => ({
      cursor, limit: pageSize, ...(request.filter === undefined ? {} : { filter: request.filter }), ...(signal ? { signal } : {}),
    });

    const startedAt = now();
    let rows = 0;
    let denied = 0;
    let bytes = 0;
    let pages = 0;
    let finished = false;
    let emptyRun = 0;

    async function finish(error: CsvExportCode | undefined, truncated = false): Promise<void> {
      if (finished) return;
      finished = true;
      const summary: ExportSummary = {
        ok: error === undefined, ...(error === undefined ? {} : { error }), tenantId: who.tenantId, userId: who.userId,
        columns: keys, rows, denied, bytes, pages, truncated, startedAt, finishedAt: now(),
      };
      if (options.log) await options.log.record(summary).catch(() => undefined);
      try { options.onFinish?.(summary); } catch { /* observers never break the export */ }
    }

    // The first page is fetched before returning, so a failing source surfaces as an error status, not a cut file.
    let page: RowPage<Row> | null = await fetchPage(who, query(null));
    pages = 1;
    let cursor = page.nextCursor;

    let prefix = "";
    if (writeHeader) prefix = record(columns.map((c) => formatCell(c.header, cell)));
    const head = encoder.encode(prefix);
    const headBytes = (bom ? BOM_BYTES.length : 0) + head.byteLength;
    if (headBytes > maxBytes) throw new CsvExportError("limit-exceeded", "The header alone exceeds maxBytes");
    let pendingHead: Uint8Array | null = new Uint8Array(headBytes);
    if (bom) pendingHead.set(BOM_BYTES, 0);
    pendingHead.set(head, bom ? BOM_BYTES.length : 0);
    bytes = headBytes;

    /** Encodes one page into a chunk. Returns the chunk and whether the export must stop (limit reached). */
    async function encode(current: RowPage<Row>): Promise<{ chunk: Uint8Array | null; stop: "truncate" | null }> {
      const parts: Uint8Array[] = [];
      let size = 0;
      let stop: "truncate" | null = null;
      for (const row of current.rows) {
        if (options.tenantOf && options.tenantOf(row) !== who.tenantId) { denied++; continue; }
        if (options.authorize && !(await options.authorize(who, row))) { denied++; continue; }
        if (rows >= maxRows) {
          if (onLimit === "error") throw new CsvExportError("limit-exceeded", `The export has more than ${maxRows} rows`);
          stop = "truncate";
          break;
        }
        const encoded = encoder.encode(record(columns.map((c) => formatCell(c.value(row), cell))));
        if (bytes + encoded.byteLength > maxBytes) {
          if (onLimit === "error") throw new CsvExportError("limit-exceeded", `The export is larger than ${maxBytes} bytes`);
          stop = "truncate";
          break;
        }
        parts.push(encoded);
        size += encoded.byteLength;
        bytes += encoded.byteLength;
        rows++;
      }
      if (size === 0) return { chunk: null, stop };
      const chunk = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) { chunk.set(part, offset); offset += part.byteLength; }
      return { chunk, stop };
    }

    const stream = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        try {
          if (pendingHead) {
            const first = pendingHead;
            pendingHead = null;
            controller.enqueue(first);
            return;
          }
          for (;;) {
            if (finished) return;
            if (page === null) {
              if (cursor === null) {
                await finish(undefined);
                controller.close();
                return;
              }
              if (signal?.aborted) throw new CsvExportError("cancelled", "The export was cancelled");
              page = await fetchPage(who, query(cursor));
              if (finished) return;
              pages++;
              cursor = page.nextCursor;
            }
            const current: RowPage<Row> = page;
            page = null;
            emptyRun = current.rows.length === 0 ? emptyRun + 1 : 0;
            if (emptyRun > MAX_EMPTY_PAGES) throw new CsvExportError("source-error", "The row source returned too many empty pages");
            const { chunk, stop } = await encode(current);
            if (finished) return;
            if (chunk) controller.enqueue(chunk);
            if (stop) {
              await finish(undefined, true);
              controller.close();
              return;
            }
            if (chunk) return;
          }
        } catch (error) {
          // An abort that makes a pending fetch reject (fetch, a pg query cancel) is a cancellation, not a source fault.
          const failure = signal?.aborted
            ? new CsvExportError("cancelled", "The export was cancelled", { cause: error })
            : error instanceof CsvExportError ? error : new CsvExportError("source-error", "The export failed", { cause: error });
          if (!finished) {
            await finish(failure.code);
            controller.error(failure);
          }
        }
      },
      cancel: async () => {
        await finish("cancelled");
      },
    }, new ByteLengthQueuingStrategy({ highWaterMark }));

    return { stream, filename, headers: downloadHeaders(filename), columns: keys };
  }

  return {
    exportCsv,
    declared,
    columnsFor: (requester) => declared.filter((c) => readable(requester, c.key)).map((c) => ({ key: c.key, header: c.header })),
    defaultsFor: (requester) => defaults.filter((key) => readable(requester, key)),
  };
}
