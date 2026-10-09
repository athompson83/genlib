// SPDX-License-Identifier: Apache-2.0

export const notificationChannels = ["email", "push", "inApp"] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export interface PreferenceDefinition {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly channels: readonly NotificationChannel[];
  /** Channels default to false unless explicitly enabled here. */
  readonly defaults?: Readonly<Partial<Record<NotificationChannel, boolean>>>;
}

export type PreferenceSchema = readonly PreferenceDefinition[];
export type NotificationPreferences = Record<
  string,
  Partial<Record<NotificationChannel, boolean>>
>;

export interface PreferencesSnapshot {
  readonly revision: number;
  readonly preferences: NotificationPreferences;
}

export class PreferencesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreferencesValidationError";
  }
}

export class PreferencesConflictError extends Error {
  readonly snapshot: PreferencesSnapshot;

  constructor(snapshot: PreferencesSnapshot) {
    super("Preferences changed elsewhere. Review the latest settings before saving.");
    this.name = "PreferencesConflictError";
    this.snapshot = snapshot;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

/** Validate once at application startup, then share the returned immutable schema. */
export function createPreferenceSchema(input: PreferenceSchema): PreferenceSchema {
  if (!Array.isArray(input) || input.length < 1 || input.length > 32) {
    throw new PreferencesValidationError("A schema must contain between 1 and 32 preference types.");
  }
  const keys = new Set<string>();
  const schema = input.map((entry) => {
    if (!object(entry) || typeof entry.key !== "string" ||
        !/^[a-z][a-z0-9_-]{0,47}$/.test(entry.key) ||
        ["constructor", "prototype"].includes(entry.key) || keys.has(entry.key)) {
      throw new PreferencesValidationError("Preference keys must be unique, safe identifiers.");
    }
    keys.add(entry.key);
    if (typeof entry.label !== "string" || !entry.label.trim() || entry.label.length > 120 ||
        (entry.description !== undefined &&
          (typeof entry.description !== "string" || entry.description.length > 500))) {
      throw new PreferencesValidationError("Preference labels and descriptions must be bounded text.");
    }
    if (!Array.isArray(entry.channels) || entry.channels.length < 1 ||
        entry.channels.length > notificationChannels.length ||
        new Set(entry.channels).size !== entry.channels.length ||
        entry.channels.some((channel) => !notificationChannels.includes(channel))) {
      throw new PreferencesValidationError("A preference must declare unique, supported channels.");
    }
    const channels = entry.channels as readonly NotificationChannel[];
    if (entry.defaults !== undefined && (!object(entry.defaults) ||
        Object.entries(entry.defaults).some(([channel, enabled]) =>
          !channels.includes(channel as NotificationChannel) || typeof enabled !== "boolean"))) {
      throw new PreferencesValidationError("Defaults may only configure the declared channels.");
    }
    return Object.freeze({
      key: entry.key,
      label: entry.label,
      ...(entry.description === undefined ? {} : { description: entry.description }),
      channels: Object.freeze([...channels]),
      defaults: Object.freeze({ ...entry.defaults }),
    });
  });
  return Object.freeze(schema);
}

export function defaultPreferences(schema: PreferenceSchema): NotificationPreferences {
  return Object.fromEntries(schema.map((entry) => [
    entry.key,
    Object.fromEntries(entry.channels.map((channel) => [channel, entry.defaults?.[channel] ?? false])),
  ]));
}

/** Full replacement: unknown/missing types, channels, and non-booleans are rejected. */
export function validatePreferences(
  schema: PreferenceSchema,
  input: unknown,
): NotificationPreferences {
  if (!object(input) || !exactKeys(input, schema.map((entry) => entry.key))) {
    throw new PreferencesValidationError("Provide exactly the configured preference types.");
  }
  return Object.fromEntries(schema.map((entry) => {
    const values = input[entry.key];
    if (!object(values) || !exactKeys(values, entry.channels) ||
        entry.channels.some((channel) => typeof values[channel] !== "boolean")) {
      throw new PreferencesValidationError("Provide boolean values for exactly the configured channels.");
    }
    return [entry.key, Object.fromEntries(entry.channels.map((channel) => [channel, values[channel]]))];
  }));
}

export function validateSnapshot(schema: PreferenceSchema, input: unknown): PreferencesSnapshot {
  if (!object(input) || !exactKeys(input, ["revision", "preferences"]) ||
      typeof input.revision !== "number" || !Number.isSafeInteger(input.revision) ||
      input.revision < 0 || input.revision >= Number.MAX_SAFE_INTEGER) {
    throw new PreferencesValidationError("Provide preferences and a nonnegative safe revision.");
  }
  return { revision: input.revision, preferences: validatePreferences(schema, input.preferences) };
}

/** Equality independent of property order; use on validated preference documents. */
export function preferencesEqual(
  left: NotificationPreferences,
  right: NotificationPreferences,
): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => {
    const a = left[key];
    const b = right[key];
    return a !== undefined && b !== undefined &&
      Object.keys(a).length === Object.keys(b).length &&
      Object.entries(a).every(([channel, enabled]) => b[channel as NotificationChannel] === enabled);
  });
}
