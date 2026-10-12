// SPDX-License-Identifier: Apache-2.0
// The one error type of the recurring-events module. `code` is stable and maps to an HTTP status in http.ts.

export type RecurringEventsErrorCode =
  | "invalid-input"
  | "invalid-rule"
  | "unsupported-rule"
  | "not-found"
  | "not-an-occurrence"
  | "version-conflict"
  | "too-many-overrides";

export class RecurringEventsError extends Error {
  readonly code: RecurringEventsErrorCode;
  constructor(code: RecurringEventsErrorCode, message: string) {
    super(message);
    this.name = "RecurringEventsError";
    this.code = code;
  }
}
