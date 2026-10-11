# CSV import pipeline · 0.1.0

## What installs

Three original Apache-2.0 TypeScript files under `csv-import/`:

- `core.ts`: `createImporter` (preview, validate, commit, cancel, exportErrors), the RFC 4180 `parseCsv` with `detectDelimiter`, `suggestMapping`, `parseValue`, `toSafeCsv`, `ImportError` and the `ImportStore` interface.
- `memory-store.ts`: `MemoryImportStore`, a per-process reference store for tests and prototypes.
- `http.ts`: `createImportHandler`, a server-only Fetch `Request`/`Response` adapter.

There is no hidden database, user system or record writer. The receiving application supplies those through four integration points.

## When to use it

Use it when users of an app upload a spreadsheet exported as CSV (contacts, products, members, transactions) and you want the usual flow: upload, check the column mapping, see which rows are wrong, then save the good rows once. Do not use it for Excel files, multi-gigabyte data loads or machine-to-machine feeds: those need a streaming loader or an API. To only read or write CSV text, use the `csv-parse` and `csv-safe` recipes instead.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `fields` | The importable fields: `key`, `label`, `required`, `aliases`, `parse` (`string`, `integer`, `decimal`, `boolean`, `date`, `email` or a function returning `{ok, value}` or `{ok: false, code, message}`), `unique` and `maxLength`. |
| `ImportStore` | A table holding the staged rows, mapping, errors and result, with a conditional status update (`UPDATE ... WHERE id = $1 AND status = $2`) and a scheduled delete of expired imports. |
| `onRow(record, rowNumber)` | Your save function for one valid record. Make it idempotent on `(importId, rowNumber)` and enforce database uniqueness there. Throw to record the row as failed. |
| `authenticate(request)` | The signed-in user's `tenantId` and `userId`, from your session or verified token. Never from the request body. |

```ts
import { createImporter } from "./genlib/csv-import/core.js";
import { createImportHandler } from "./genlib/csv-import/http.js";

const importer = createImporter({
  store,
  fields: [
    { key: "email", label: "Email", required: true, parse: "email", unique: true, aliases: ["e-mail"] },
    { key: "name", label: "Full name", required: true },
    { key: "seats", label: "Seats", parse: "integer" },
  ],
});
export const handler = createImportHandler({
  importer, prefix: "/api/imports", allowedOrigins: [APP_ORIGIN], authenticate,
  onRow: (actor, record, row) => db.contacts.upsert({ tenantId: actor.tenantId, ...record }),
});
```

## Behavior

- `parseCsv` follows RFC 4180: quoted fields with `""` escapes, delimiters and line breaks inside quotes, CRLF, LF or CR endings, and a stripped UTF-8 BOM. A quote inside an unquoted field, text after a closing quote and an unterminated quote fail with `invalid-csv` and the record number.
- The delimiter is detected from the header record among comma, semicolon, tab and pipe (quoted text ignored; ties prefer that order), unless fixed.
- Limits default to 5 MiB (UTF-8 bytes), 10,000 data rows, 200 columns and 10,000 characters per field.
- `preview` requires a header row with non-empty, distinct (case-insensitive) names, skips blank lines and stages the rows. It returns `{importId, delimiter, headers, mapping, sampleRows, rowCount}`.
- `suggestMapping` matches each field's key, label and aliases against the headers, ignoring case, accents, spaces and punctuation (`E-Mail Address` matches `email address`). Each header is used once.
- `validate(actor, importId, mapping)` takes `{fieldKey: header | null}`. Unknown fields, unknown headers and a header mapped twice fail with `invalid-mapping`; an unmapped required field fails with `missing-required-field`. Each row is then checked. Row errors are `{row, field, code, message, value}`, where `row` is the spreadsheet row (header = 1). The codes are `required`, `too-long`, `invalid-integer`, `invalid-decimal`, `invalid-boolean`, `invalid-date`, `invalid-email`, a custom parser's code, `duplicate` and `extra-columns`. Duplicates in `unique` fields (case-insensitive for text) are flagged on the later rows and listed in `duplicates`. Validation can be repeated with a new mapping until commit.
- `commit(actor, importId, {onRow, batchSize})` saves only valid rows. Rows in a batch run concurrently (default 1, at most 100) and progress is stored after each batch. A failed `onRow` adds a `row-failed` error and the commit continues. Only an `ImportError` message thrown by `onRow` reaches the report; other messages are replaced so database internals stay private. The result is `{importId, total, committed, failed, skipped, committedAt}`.
- Commit is idempotent. A repeated commit returns the first result without calling `onRow`, a concurrent one fails with `commit-in-progress`, and commit before validation fails with `not-validated`.
- Imports belong to the actor's `tenantId` and `userId`. Another actor's id, a malformed id and an import past its lifetime (default 24 hours, 1 minute to 7 days) all read as `not-found`.
- `exportErrors(actor, importId)` returns CSV with the columns `row, field, column, code, message, value`. Any cell starting with `=`, `+`, `-`, `@`, TAB or CR gets a leading `'`, so a spreadsheet does not run it as a formula. Up to 10,000 errors are kept for the report, and the counts stay exact beyond that.
- `cancel` deletes the import and its staged rows. It is refused while a commit is running.

## HTTP routes

| Route | Body | Result |
| --- | --- | --- |
| `POST {prefix}` | the CSV file (`text/csv`, `text/plain` or `application/vnd.ms-excel`, UTF-8) | `201` preview |
| `POST {prefix}/{id}/validate` | `{mapping}` | `200` validation result |
| `POST {prefix}/{id}/commit` | none | `200` commit result (repeat-safe) |
| `GET {prefix}/{id}/errors.csv` | none | `200 text/csv` download |
| `DELETE {prefix}/{id}` | none | `204` |

Error codes map to HTTP statuses:

| Code | Status |
| --- | --- |
| `invalid-csv`, `empty-file`, `invalid-header`, `invalid-mapping`, `missing-required-field`, `bad-request` | 400 |
| `forbidden` | 403 |
| `not-found` | 404 |
| `not-validated`, `commit-in-progress`, `already-committed` | 409 |
| `too-large`, `too-many-rows`, `too-many-columns` | 413 |
| `unsupported-media-type` | 415 |

Signed-out callers get 401. State-changing requests without an allowed `Origin` get 403. Uploads above `maxUploadBytes` (default 5 MiB) are cut off while streaming, and non-UTF-8 bytes are refused. Responses carry `cache-control: no-store`.

## Verify

`npm run build && node --test tests/csv-import.test.mjs` covers these cases:

- quoting, CRLF and BOM handling, and delimiter detection
- size, row, column and field caps
- mapping suggestion with aliases
- each parser type's valid and invalid values
- missing required fields and in-file duplicates
- commit idempotency, concurrent commits and `onRow` failures
- tenant and user isolation and expiry
- formula escaping in the error report
- the HTTP adapter's routes, status codes, origin check, 401 and upload cap

In the receiving app, add the same cases against your real store and `onRow`, including two concurrent commits against the database and an upload from an ordinary user of another tenant.

## If something fails

- Every header shows "not mapped" → the file was exported with another delimiter inside quotes or as UTF-16; re-export as "CSV UTF-8", or pass a fixed `delimiter` in `limits`.
- A commit runs twice → your store's `update` does not compare the current status; it must change only rows still in the `from` status, atomically.
- An import is stuck in `committing` after a crash → read its `progress`, rerun the remaining rows through your idempotent `onRow` and set the status yourself, or delete it and import again.
- Users see "The row could not be saved" → `onRow` threw a non-`ImportError`; throw `new ImportError("bad-request", "Email already exists")` to show a user-facing reason.

## Limits

This package does not save records, enforce database uniqueness, read Excel files or other encodings, or rate-limit uploads. Add request limits to the upload route (see the `rate-limit` module). Decimals parse to JavaScript numbers; use a custom parser for exact money or local date formats. Production database correctness, session security and consuming-application acceptance remain project responsibilities.
