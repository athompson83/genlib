// SPDX-License-Identifier: Apache-2.0
// JSON-lines logger. No environment reads, file writes, network transport, or global state.

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogThreshold = LogLevel | "silent";
export type LogFields = Readonly<Record<string, unknown>>;
/** Receives one serialized JSON line (no trailing newline). Errors thrown by a sink are swallowed. */
export type LogSink = (line: string, level: LogLevel) => void;

export const REDACTED = "[REDACTED]";

/** Matched against keys after lowercasing and removing "-", "_", ".", and spaces. */
export const DEFAULT_REDACT_KEYS: readonly string[] = Object.freeze([
  "password", "passwd", "secret", "token", "access_token", "refresh_token", "id_token",
  "authorization", "proxy-authorization", "cookie", "set-cookie", "apiKey", "api_key", "x-api-key",
  "client_secret", "private_key", "session_token",
]);

export interface LoggerLimits {
  /** Nested object/array depth before values become "[Object]"/"[Array]". Default 8. */
  maxDepth?: number;
  /** Characters per string before truncation. Default 4096. */
  maxStringLength?: number;
  /** Array items kept per array. Default 100. */
  maxArrayLength?: number;
  /** Keys kept per object. Default 100. */
  maxKeys?: number;
  /** Error `cause` links followed. Default 3. */
  maxCauseDepth?: number;
  /** UTF-8 bytes per line; larger records are replaced by a truncation notice. Default 16384. */
  maxLineBytes?: number;
}

export interface LoggerOptions extends LoggerLimits {
  level?: LogThreshold;
  sink?: LogSink;
  /** Fields included on every record (snapshotted and redacted at creation). */
  base?: LogFields;
  /** Extra keys to redact, added to DEFAULT_REDACT_KEYS. */
  redact?: readonly string[];
  /** Include Error stacks. Default false (stacks can reveal paths and internals). */
  includeStack?: boolean;
  clock?: () => Date | number;
}

export interface Logger {
  readonly level: LogThreshold;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  isLevelEnabled(level: LogLevel): boolean;
  /** New logger with extra bindings; the parent is unchanged. */
  child(bindings: LogFields): Logger;
}

const RANK: Record<LogThreshold, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const RESERVED = new Set(["time", "level", "msg"]);

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[-_. ]/g, "");

function limit(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`structured-logger: ${label} must be a positive integer.`);
  }
  return value;
}

export const defaultSink: LogSink = (line, level) => {
  if (level === "warn" || level === "error") console.error(line);
  else console.log(line);
};

interface Settings {
  redact: ReadonlySet<string>;
  includeStack: boolean;
  maxDepth: number;
  maxStringLength: number;
  maxArrayLength: number;
  maxKeys: number;
  maxCauseDepth: number;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…[truncated ${text.length - max} chars]`;
}

/** Convert any value into a JSON-safe, redacted, bounded tree. Never throws. */
function serialize(value: unknown, settings: Settings, depth: number, ancestors: object[]): unknown {
  switch (typeof value) {
    case "string": return truncate(value, settings.maxStringLength);
    case "number": return Number.isFinite(value) ? value : String(value);
    case "boolean": return value;
    case "bigint": return value.toString();
    case "undefined": return undefined;
    case "symbol": return truncate(value.toString(), settings.maxStringLength);
    case "function": return `[Function${value.name ? " " + truncate(value.name, 100) : ""}]`;
  }
  if (value === null) return null;
  const object = value as object;
  if (ancestors.includes(object)) return "[Circular]";
  try {
    if (object instanceof Date) return Number.isNaN(object.getTime()) ? "Invalid Date" : object.toISOString();
    if (object instanceof Error) return serializeError(object, settings, depth, ancestors, 0);
    if (ArrayBuffer.isView(object)) return `[${object.constructor.name} byteLength=${object.byteLength}]`;
    if (object instanceof ArrayBuffer) return `[ArrayBuffer byteLength=${object.byteLength}]`;
    if (object instanceof RegExp) return truncate(String(object), settings.maxStringLength);
    if (depth >= settings.maxDepth) return Array.isArray(object) ? "[Array]" : "[Object]";
    const next = [...ancestors, object];
    if (Array.isArray(object) || object instanceof Set) {
      const items = Array.isArray(object) ? object : [...object];
      const out = items.slice(0, settings.maxArrayLength).map(item => {
        const result = serialize(item, settings, depth + 1, next);
        return result === undefined ? null : result;
      });
      if (items.length > settings.maxArrayLength) out.push(`[… ${items.length - settings.maxArrayLength} more]`);
      return out;
    }
    let pairs: [string, unknown][];
    if (object instanceof Map) {
      pairs = [...object.entries()].map(([key, item]) => [String(key), item]);
    } else if (typeof Headers !== "undefined" && object instanceof Headers) {
      pairs = [...object.entries()];
    } else {
      pairs = Object.keys(object).map(key => [key, readProperty(object, key)]);
    }
    return serializePairs(pairs, settings, depth, next);
  } catch {
    return "[Unserializable]";
  }
}

function readProperty(object: object, key: string): unknown {
  try {
    return (object as Record<string, unknown>)[key];
  } catch {
    return "[Unserializable]";
  }
}

function serializePairs(pairs: [string, unknown][], settings: Settings, depth: number, ancestors: object[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, item] of pairs) {
    if (kept >= settings.maxKeys) {
      out["…"] = `${pairs.length - kept} more keys`;
      break;
    }
    kept += 1;
    if (settings.redact.has(normalizeKey(key))) {
      out[key] = REDACTED;
      continue;
    }
    const result = serialize(item, settings, depth + 1, ancestors);
    if (result !== undefined) out[key] = result;
  }
  return out;
}

function serializeError(error: Error, settings: Settings, depth: number, ancestors: object[], causeDepth: number): unknown {
  const next = [...ancestors, error];
  const out: Record<string, unknown> = {
    name: truncate(String(readProperty(error, "name") ?? "Error"), 200),
    message: truncate(String(readProperty(error, "message") ?? ""), settings.maxStringLength),
  };
  const stack = readProperty(error, "stack");
  if (settings.includeStack && typeof stack === "string") out.stack = truncate(stack, settings.maxStringLength);
  // Own enumerable fields such as `code` or `status` go through the same redaction and limits.
  const extra = serializePairs(
    Object.keys(error).filter(key => !["name", "message", "stack", "cause"].includes(key))
      .map(key => [key, readProperty(error, key)]),
    settings, depth, next,
  );
  Object.assign(out, extra);
  if ("cause" in error) {
    const cause = readProperty(error, "cause");
    if (causeDepth >= settings.maxCauseDepth) out.cause = "[Cause depth exceeded]";
    else if (cause instanceof Error) {
      out.cause = next.includes(cause) ? "[Circular]" : serializeError(cause, settings, depth, next, causeDepth + 1);
    } else if (cause !== undefined) out.cause = serialize(cause, settings, depth + 1, next);
  }
  return out;
}

function sanitizeFields(fields: unknown, settings: Settings): Record<string, unknown> {
  if (fields === undefined || fields === null) return {};
  if (fields instanceof Error) return { err: serialize(fields, settings, 0, []) };
  if (typeof fields !== "object" || Array.isArray(fields)) return { fields: serialize(fields, settings, 0, []) };
  const result = serialize(fields, settings, 0, []);
  return typeof result === "object" && result !== null && !Array.isArray(result) ? result as Record<string, unknown> : { fields: result };
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  if (!Object.hasOwn(RANK, level)) throw new TypeError("structured-logger: unknown level.");
  const sink = options.sink ?? defaultSink;
  if (typeof sink !== "function") throw new TypeError("structured-logger: sink must be a function.");
  const clock = options.clock ?? (() => new Date());
  const extra = options.redact ?? [];
  if (!Array.isArray(extra) || extra.some(key => typeof key !== "string")) {
    throw new TypeError("structured-logger: redact must be a list of key names.");
  }
  const settings: Settings = Object.freeze({
    redact: new Set([...DEFAULT_REDACT_KEYS, ...extra].map(normalizeKey)),
    includeStack: options.includeStack === true,
    maxDepth: limit(options.maxDepth, 8, "maxDepth"),
    maxStringLength: limit(options.maxStringLength, 4096, "maxStringLength"),
    maxArrayLength: limit(options.maxArrayLength, 100, "maxArrayLength"),
    maxKeys: limit(options.maxKeys, 100, "maxKeys"),
    maxCauseDepth: limit(options.maxCauseDepth, 3, "maxCauseDepth"),
  });
  const maxLineBytes = limit(options.maxLineBytes, 16384, "maxLineBytes");
  const encoder = new TextEncoder();

  const timestamp = (): string => {
    try {
      const value = clock();
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    } catch {
      return new Date().toISOString();
    }
  };

  const build = (bindings: Record<string, unknown>): Logger => {
    const write = (recordLevel: LogLevel, msg: string, fields: LogFields | undefined): void => {
      if (RANK[recordLevel] < RANK[level]) return;
      const time = timestamp();
      const text = truncate(typeof msg === "string" ? msg : String(msg), settings.maxStringLength);
      const record: Record<string, unknown> = { time, level: recordLevel, msg: text };
      for (const source of [bindings, sanitizeFields(fields, settings)]) {
        for (const [key, value] of Object.entries(source)) {
          // Reserved names cannot be overwritten; keep the caller's value under a prefixed key.
          record[RESERVED.has(key) ? `_${key}` : key] = value;
        }
      }
      let line: string;
      try {
        line = JSON.stringify(record);
      } catch {
        line = JSON.stringify({ time, level: recordLevel, msg: text, logError: "unserializable record" });
      }
      const bytes = encoder.encode(line).length;
      if (bytes > maxLineBytes) {
        line = JSON.stringify({ time, level: recordLevel, msg: truncate(text, 256), truncated: true, originalBytes: bytes });
      }
      try {
        sink(line, recordLevel);
      } catch {
        // Logging must not break the caller's control flow.
      }
    };
    return Object.freeze({
      level,
      debug: (msg: string, fields?: LogFields) => write("debug", msg, fields),
      info: (msg: string, fields?: LogFields) => write("info", msg, fields),
      warn: (msg: string, fields?: LogFields) => write("warn", msg, fields),
      error: (msg: string, fields?: LogFields) => write("error", msg, fields),
      isLevelEnabled: (candidate: LogLevel) => RANK[candidate] >= RANK[level],
      child: (extraBindings: LogFields) => build({ ...bindings, ...sanitizeFields(extraBindings, settings) }),
    });
  };

  return build(sanitizeFields(options.base, settings));
}
