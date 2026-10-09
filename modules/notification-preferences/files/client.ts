// SPDX-License-Identifier: Apache-2.0
import { createPreferenceSchema, PreferencesConflictError, validateSnapshot } from "./core.js";
import type { PreferenceSchema, PreferencesSnapshot } from "./core.js";

export class PreferencesRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("The preference request could not be completed.");
    this.name = "PreferencesRequestError";
    this.status = status;
  }
}

export interface PreferencesClientOptions {
  readonly endpoint: string | URL;
  readonly schema: PreferenceSchema;
  readonly fetch?: typeof globalThis.fetch;
}

export function createPreferencesClient(options: PreferencesClientOptions) {
  const schema = createPreferenceSchema(options.schema);
  const fetchRequest = options.fetch ?? globalThis.fetch;
  async function perform(method: "GET" | "PUT", snapshot?: PreferencesSnapshot): Promise<PreferencesSnapshot> {
    const result = await fetchRequest(options.endpoint, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(snapshot === undefined ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validateSnapshot(schema, snapshot)),
      }),
    });
    if (result.status === 409) {
      const body = await result.json() as { snapshot?: unknown };
      throw new PreferencesConflictError(validateSnapshot(schema, body.snapshot));
    }
    if (!result.ok) throw new PreferencesRequestError(result.status);
    return validateSnapshot(schema, await result.json());
  }
  return {
    read: () => perform("GET"),
    save: (snapshot: PreferencesSnapshot) => perform("PUT", snapshot),
  };
}
