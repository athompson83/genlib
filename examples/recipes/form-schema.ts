// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: server-side form validation from a small declarative schema. Original source; copy and adapt.
// Validate on the server even when the browser already validated; return error codes (not
// messages) so the UI can localize them. The email rule is a deliberately simple shape check:
// confirm ownership by sending a verification link. Patterns come from the schema author,
// never from end users (a hostile regular expression can be slow).

export type FieldType = "string" | "number" | "integer" | "boolean" | "email" | "date";
export type ValidationCode = "required" | "type" | "minLength" | "maxLength" | "min" | "max" | "pattern" | "enum" | "email" | "date" | "unknown";

export interface FieldSchema {
  name: string;
  type: FieldType;
  required?: boolean;
  minLength?: number; // Unicode code points
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string; // must match the whole value
  enum?: readonly string[];
}

const TYPES: readonly FieldType[] = ["string", "number", "integer", "boolean", "email", "date"];

function isEmail(value: string): boolean {
  const parts = value.split("@");
  const [local, domain] = parts;
  return parts.length === 2 && !!local && !!domain && domain.includes(".") && !/\s/u.test(value) && [...value].length <= 254;
}

function isDate(value: string): boolean {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return days !== undefined && day >= 1 && day <= days;
}

function typeMatches(type: FieldType, value: unknown): boolean {
  switch (type) {
    case "boolean": return typeof value === "boolean";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    default: return typeof value === "string";
  }
}

function compile(schema: readonly FieldSchema[]): Map<string, { field: FieldSchema; pattern?: RegExp }> {
  const compiled = new Map<string, { field: FieldSchema; pattern?: RegExp }>();
  for (const field of schema) {
    if (!field.name || compiled.has(field.name)) throw new Error(`Missing or duplicate field name: ${JSON.stringify(field.name)}`);
    if (!TYPES.includes(field.type)) throw new Error(`Unknown type for ${field.name}: ${String(field.type)}`);
    compiled.set(field.name, field.pattern === undefined ? { field } : { field, pattern: new RegExp(`^(?:${field.pattern})$`, "u") });
  }
  return compiled;
}

function checkField(field: FieldSchema, pattern: RegExp | undefined, value: unknown): ValidationCode[] {
  if (value === undefined || value === null || value === "") return field.required ? ["required"] : [];
  if (!typeMatches(field.type, value)) return ["type"];
  const codes: ValidationCode[] = [];
  if (typeof value === "string") {
    const length = [...value].length;
    if (field.minLength !== undefined && length < field.minLength) codes.push("minLength");
    if (field.maxLength !== undefined && length > field.maxLength) codes.push("maxLength");
  }
  if (typeof value === "number") {
    if (field.min !== undefined && value < field.min) codes.push("min");
    if (field.max !== undefined && value > field.max) codes.push("max");
  }
  if (typeof value === "string") {
    if (pattern && !pattern.test(value)) codes.push("pattern");
    if (field.enum && !field.enum.includes(value)) codes.push("enum");
    if (field.type === "email" && !isEmail(value)) codes.push("email");
    if (field.type === "date" && !isDate(value)) codes.push("date");
  }
  return codes;
}

/**
 * Returns field name -> error codes, only for fields with errors, in schema order followed by
 * unknown input keys in input order. Use Object.fromEntries(result) to serialize it as JSON.
 */
export function validate(schema: readonly FieldSchema[], values: Readonly<Record<string, unknown>>, allowUnknown = false): Map<string, ValidationCode[]> {
  const compiled = compile(schema);
  const errors = new Map<string, ValidationCode[]>();
  for (const [name, { field, pattern }] of compiled) {
    const codes = checkField(field, pattern, Object.hasOwn(values, name) ? values[name] : undefined);
    if (codes.length > 0) errors.set(name, codes);
  }
  if (!allowUnknown) {
    for (const key of Object.keys(values)) if (!compiled.has(key)) errors.set(key, ["unknown"]);
  }
  return errors;
}
