// SPDX-License-Identifier: Apache-2.0
// Field definitions for env-config. No environment, filesystem, or network access occurs here.

/** Thrown by a field parser. Messages are fixed text and never contain the raw value. */
export class FieldIssue extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldIssue";
  }
}

export interface Field<T> {
  readonly kind: string;
  /** Short type hint used in descriptions and `.env.example` comments. */
  readonly hint: string;
  readonly isOptional: boolean;
  readonly isSecret: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue: T | undefined;
  readonly description: string | undefined;
  readonly exampleValue: string | undefined;
  /** Parse a nonempty raw string. Throws FieldIssue with a value-free message. */
  parse(raw: string): T;
  /** Missing or empty input yields `undefined` instead of an error. */
  optional(): Field<T | undefined>;
  /** Mark the value as sensitive: redacted from JSON, inspection, descriptions, and examples. */
  secret(): Field<T>;
  describe(text: string): Field<T>;
  /** Placeholder written to `.env.example` when there is no (non-secret) default. */
  example(text: string): Field<T>;
}

interface FieldState<T> {
  kind: string;
  hint: string;
  isOptional: boolean;
  isSecret: boolean;
  hasDefault: boolean;
  defaultValue: T | undefined;
  description: string | undefined;
  exampleValue: string | undefined;
  parse: (raw: string) => T;
}

function makeField<T>(state: FieldState<T>): Field<T> {
  const field: Field<T> = {
    kind: state.kind,
    hint: state.hint,
    isOptional: state.isOptional,
    isSecret: state.isSecret,
    hasDefault: state.hasDefault,
    defaultValue: state.defaultValue,
    description: state.description,
    exampleValue: state.exampleValue,
    parse: state.parse,
    optional: () => makeField<T | undefined>({ ...state, isOptional: true }),
    secret: () => makeField<T>({ ...state, isSecret: true }),
    describe: text => makeField<T>({ ...state, description: oneLine(text) }),
    example: text => makeField<T>({ ...state, exampleValue: oneLine(text) }),
  };
  return Object.freeze(field);
}

function oneLine(text: string): string {
  if (typeof text !== "string") throw new TypeError("env-config: text must be a string.");
  return text.replace(/[\r\n]+/g, " ").trim();
}

function base<T>(kind: string, hint: string, parse: (raw: string) => T, defaultValue: T | undefined): Field<T> {
  return makeField<T>({
    kind, hint, parse,
    isOptional: false,
    isSecret: false,
    hasDefault: defaultValue !== undefined,
    defaultValue,
    description: undefined,
    exampleValue: undefined,
  });
}

function nonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`env-config: ${label} must be a non-negative integer.`);
  }
  return value;
}

function safeRegExp(pattern: RegExp | undefined): RegExp | undefined {
  if (pattern === undefined) return undefined;
  if (!(pattern instanceof RegExp)) throw new TypeError("env-config: pattern must be a RegExp.");
  // Drop stateful flags so repeated parses are deterministic.
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
}

export interface StrOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}

export function str<const C extends readonly [string, ...string[]]>(
  options: StrOptions & { choices: C; default?: C[number] },
): Field<C[number]>;
export function str(options?: StrOptions & { default?: string }): Field<string>;
export function str(options: StrOptions & { choices?: readonly string[]; default?: string } = {}): Field<string> {
  const minLength = nonNegativeInteger(options.minLength, "minLength");
  const maxLength = nonNegativeInteger(options.maxLength, "maxLength");
  const pattern = safeRegExp(options.pattern);
  const choices = options.choices === undefined ? undefined : Object.freeze([...options.choices]);
  if (choices && (choices.length === 0 || choices.some(choice => typeof choice !== "string"))) {
    throw new TypeError("env-config: choices must be a nonempty list of strings.");
  }
  if (options.default !== undefined && typeof options.default !== "string") {
    throw new TypeError("env-config: str default must be a string.");
  }
  const hint = choices ? `one of ${choices.join(" | ")}` : "string";
  return base<string>("string", hint, raw => {
    if (minLength !== undefined && raw.length < minLength) throw new FieldIssue(`must be at least ${minLength} characters`);
    if (maxLength !== undefined && raw.length > maxLength) throw new FieldIssue(`must be at most ${maxLength} characters`);
    if (pattern && !pattern.test(raw)) throw new FieldIssue("does not match the required pattern");
    if (choices && !choices.includes(raw)) throw new FieldIssue(`must be one of: ${choices.join(", ")}`);
    return raw;
  }, options.default);
}

/** A string that is redacted everywhere env-config renders values. */
export function secret(options: StrOptions = {}): Field<string> {
  return str(options).secret();
}

export interface NumOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  default?: number;
}

export function num(options: NumOptions = {}): Field<number> {
  const { min, max, integer = false } = options;
  for (const [label, value] of [["min", min], ["max", max], ["default", options.default]] as const) {
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new TypeError(`env-config: num ${label} must be a finite number.`);
    }
  }
  const hint = [integer ? "integer" : "number", min !== undefined ? `>= ${min}` : "", max !== undefined ? `<= ${max}` : ""]
    .filter(Boolean).join(" ");
  return base<number>("number", hint, input => {
    const raw = input.trim();
    // Number("") is 0 and Number("0x10") is 16; accept only plain decimal notation.
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw)) throw new FieldIssue("must be a number");
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new FieldIssue("must be a finite number");
    if (integer && !Number.isSafeInteger(value)) throw new FieldIssue("must be an integer");
    if (min !== undefined && value < min) throw new FieldIssue(`must be >= ${min}`);
    if (max !== undefined && value > max) throw new FieldIssue(`must be <= ${max}`);
    return value;
  }, options.default);
}

const TRUE = new Set(["true", "1", "yes", "on"]);
const FALSE = new Set(["false", "0", "no", "off"]);

/** Accepts true/false, 1/0, yes/no, on/off (case-insensitive). */
export function bool(options: { default?: boolean } = {}): Field<boolean> {
  if (options.default !== undefined && typeof options.default !== "boolean") {
    throw new TypeError("env-config: bool default must be a boolean.");
  }
  return base<boolean>("boolean", "boolean (true/false/1/0)", input => {
    const raw = input.trim().toLowerCase();
    if (TRUE.has(raw)) return true;
    if (FALSE.has(raw)) return false;
    throw new FieldIssue("must be true, false, 1, 0, yes, no, on, or off");
  }, options.default);
}

export interface UrlOptions {
  /** Allowed schemes, with or without the trailing colon. Default: https and http. */
  protocols?: readonly string[];
  default?: string;
}

export function url(options: UrlOptions = {}): Field<string> {
  const protocols = (options.protocols ?? ["https", "http"]).map(protocol => {
    if (typeof protocol !== "string" || !/^[a-z][a-z0-9+.-]*:?$/i.test(protocol)) {
      throw new TypeError("env-config: protocols must be URL schemes such as https.");
    }
    return protocol.toLowerCase().replace(/:?$/, ":");
  });
  if (protocols.length === 0) throw new TypeError("env-config: protocols must not be empty.");
  return base<string>("url", `URL (${protocols.join(" ")})`, input => {
    const raw = input.trim();
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      // The URL constructor's own message can echo the input; never forward it.
      throw new FieldIssue("must be an absolute URL");
    }
    if (!protocols.includes(parsed.protocol)) throw new FieldIssue(`must use protocol ${protocols.join(" or ")}`);
    return raw;
  }, options.default);
}

export interface ListOptions {
  separator?: string;
  minItems?: number;
  maxItems?: number;
  default?: readonly string[];
}

/** Separator-delimited list (default comma). Items are trimmed; empty items are dropped. */
export function list(options: ListOptions = {}): Field<readonly string[]> {
  const separator = options.separator ?? ",";
  if (typeof separator !== "string" || separator.length === 0) throw new TypeError("env-config: separator must be nonempty.");
  const minItems = nonNegativeInteger(options.minItems, "minItems");
  const maxItems = nonNegativeInteger(options.maxItems, "maxItems");
  const fallback = options.default === undefined ? undefined : Object.freeze([...options.default]);
  return base<readonly string[]>("list", `list separated by "${separator}"`, raw => {
    const items = raw.split(separator).map(item => item.trim()).filter(item => item.length > 0);
    if (minItems !== undefined && items.length < minItems) throw new FieldIssue(`must have at least ${minItems} items`);
    if (maxItems !== undefined && items.length > maxItems) throw new FieldIssue(`must have at most ${maxItems} items`);
    return Object.freeze(items);
  }, fallback);
}

/**
 * JSON value. Pass `validate` to narrow the type; it must return the value or throw.
 * The parsed value is not deep-frozen.
 */
export function json<T = unknown>(options: { validate?: (value: unknown) => T; default?: T } = {}): Field<T> {
  const validate = options.validate;
  return base<T>("json", "JSON", raw => {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      // JSON.parse messages can quote part of the input; never forward them.
      throw new FieldIssue("must be valid JSON");
    }
    if (!validate) return value as T;
    try {
      return validate(value);
    } catch {
      throw new FieldIssue("failed validation");
    }
  }, options.default);
}
