// SPDX-License-Identifier: Apache-2.0
// The caller supplies the source record; this module never reads process.env or any global itself.

import { FieldIssue, type Field } from "./fields.js";

export { str, secret, num, bool, url, list, json, FieldIssue } from "./fields.js";
export type { Field, StrOptions, NumOptions, UrlOptions, ListOptions } from "./fields.js";

export const REDACTED = "[REDACTED]";

export type ConfigSchema = Record<string, Field<unknown>>;
export type InferConfig<S extends ConfigSchema> = {
  readonly [K in keyof S]: S[K] extends Field<infer T> ? T : never;
};

/** A source such as process.env, Deno.env.toObject(), a Workers `env`, or import.meta.env. */
export type ConfigSource = Readonly<Record<string, unknown>>;

export interface ConfigIssue {
  readonly key: string;
  readonly message: string;
}

/** Lists every problem by key. Messages are fixed text and never contain input values. */
export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];
  constructor(issues: readonly ConfigIssue[]) {
    const frozen = Object.freeze(issues.map(issue => Object.freeze({ key: issue.key, message: issue.message })));
    super(`Invalid configuration (${frozen.length} ${frozen.length === 1 ? "problem" : "problems"}):\n` +
      frozen.map(issue => `  - ${issue.key}: ${issue.message}`).join("\n"));
    this.name = "ConfigError";
    this.issues = frozen;
  }
  toJSON(): { name: string; message: string; issues: readonly ConfigIssue[] } {
    return { name: this.name, message: this.message, issues: this.issues };
  }
}

export interface FieldDescription {
  readonly key: string;
  readonly kind: string;
  readonly hint: string;
  readonly required: boolean;
  readonly secret: boolean;
  /** Absent when there is no default; REDACTED for secrets. */
  readonly default?: unknown;
  readonly description?: string;
}

export interface ConfigDefinition<S extends ConfigSchema> {
  readonly schema: Readonly<S>;
  /** Validate every key, then return a frozen typed object or throw ConfigError listing all problems. */
  parse(source: ConfigSource): InferConfig<S>;
  /** Like parse, but returns a result instead of throwing ConfigError. */
  safeParse(source: ConfigSource):
    | { readonly ok: true; readonly config: InferConfig<S> }
    | { readonly ok: false; readonly error: ConfigError };
  /** Plain copy with secret values replaced by REDACTED; safe to log. */
  redact(config: InferConfig<S>): Record<string, unknown>;
  describe(): readonly FieldDescription[];
  /** Render `.env.example` text. Secret values are always blank. */
  toExample(): string;
}

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

function rawString(value: unknown): string | undefined | FieldIssue {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.length === 0 ? undefined : value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return new FieldIssue("must be a string value");
}

function exampleValue(text: string): string {
  if (text === "" || /^[A-Za-z0-9_./:@,+-]*$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function defaultText(value: unknown): string {
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

export function defineConfig<S extends ConfigSchema>(schema: S): ConfigDefinition<S> {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new TypeError("env-config: schema must be an object of fields.");
  }
  const entries = Object.entries(schema);
  for (const [key, field] of entries) {
    if (!KEY.test(key)) throw new TypeError(`env-config: invalid variable name ${JSON.stringify(key)}.`);
    if (typeof field !== "object" || field === null || typeof field.parse !== "function") {
      throw new TypeError(`env-config: ${key} is not a field definition.`);
    }
  }
  const frozenSchema = Object.freeze({ ...schema });
  const secretKeys = entries.filter(([, field]) => field.isSecret).map(([key]) => key);

  const redact = (config: Record<string, unknown>): Record<string, unknown> => {
    const copy: Record<string, unknown> = {};
    for (const [key] of entries) {
      if (Object.hasOwn(config, key)) copy[key] = secretKeys.includes(key) ? REDACTED : config[key];
    }
    return copy;
  };

  const run = (source: ConfigSource): { config?: InferConfig<S>; error?: ConfigError } => {
    if (typeof source !== "object" || source === null) {
      throw new TypeError("env-config: parse needs a source record such as process.env.");
    }
    const issues: ConfigIssue[] = [];
    const output: Record<string, unknown> = {};
    for (const [key, field] of entries) {
      // Own properties only: avoids reading Object.prototype members such as "constructor".
      const raw = rawString(Object.hasOwn(source, key) ? source[key] : undefined);
      if (raw instanceof FieldIssue) {
        issues.push({ key, message: raw.message });
      } else if (raw === undefined) {
        if (field.hasDefault) output[key] = field.defaultValue;
        else if (field.isOptional) output[key] = undefined;
        else issues.push({ key, message: "is required" });
      } else {
        try {
          output[key] = field.parse(raw);
        } catch (error) {
          // Only FieldIssue messages are value-free by construction.
          issues.push({ key, message: error instanceof FieldIssue ? error.message : "is invalid" });
        }
      }
    }
    if (issues.length > 0) return { error: new ConfigError(issues) };
    // Non-enumerable helpers keep Object.keys and spreads typed, while JSON/inspection stay redacted.
    Object.defineProperty(output, "toJSON", { value: () => redact(output), enumerable: false });
    Object.defineProperty(output, INSPECT, { value: () => redact(output), enumerable: false });
    Object.defineProperty(output, "toString", { value: () => "[object Config]", enumerable: false });
    return { config: Object.freeze(output) as InferConfig<S> };
  };

  const describe = (): readonly FieldDescription[] => Object.freeze(entries.map(([key, field]) => {
    const item: { -readonly [K in keyof FieldDescription]: FieldDescription[K] } = {
      key, kind: field.kind, hint: field.hint, required: !field.isOptional && !field.hasDefault, secret: field.isSecret,
    };
    if (field.hasDefault) item.default = field.isSecret ? REDACTED : field.defaultValue;
    if (field.description !== undefined) item.description = field.description;
    return Object.freeze(item);
  }));

  return Object.freeze({
    schema: frozenSchema,
    parse(source: ConfigSource) {
      const result = run(source);
      if (result.error) throw result.error;
      return result.config as InferConfig<S>;
    },
    safeParse(source: ConfigSource) {
      const result = run(source);
      return result.error
        ? Object.freeze({ ok: false as const, error: result.error })
        : Object.freeze({ ok: true as const, config: result.config as InferConfig<S> });
    },
    redact: (config: InferConfig<S>) => redact(config as Record<string, unknown>),
    describe,
    toExample(): string {
      const blocks = entries.map(([key, field]) => {
        const notes = [field.hint, field.isOptional || field.hasDefault ? "optional" : "required"];
        if (field.isSecret) notes.push("secret");
        if (field.hasDefault && !field.isSecret) notes.push(`default: ${defaultText(field.defaultValue)}`);
        const lines = [];
        if (field.description) lines.push(`# ${field.description}`);
        lines.push(`# ${notes.join("; ")}`);
        const value = field.isSecret ? "" : field.exampleValue ?? (field.hasDefault ? defaultText(field.defaultValue) : "");
        lines.push(`${key}=${exampleValue(value)}`);
        return lines.join("\n");
      });
      return blocks.join("\n\n") + "\n";
    },
  });
}
