# Notification preferences · 0.1.0

## What installs

A React form, framework-neutral TypeScript validation, a browser Fetch client, a Fetch `Request`/`Response` handler factory, and optional styling. All code is original Apache-2.0 code. There is no production storage implementation or notification delivery service hidden behind these interfaces.

The feature stores a user's choices for explicitly configured notification types and channels. It does not implement marketing consent, mandatory security notices, email delivery, push enrollment, or unsubscribe links. Decide which events are optional in the receiving project before configuring this feature.

## Imports and boundaries

With the default installation directory, import:

```ts
import {
  createPreferenceSchema,
  defaultPreferences,
} from "./genlib/notification-preferences/core.js";
import { NotificationPreferencesForm } from "./genlib/notification-preferences/NotificationPreferencesForm.js";
import { createPreferencesClient } from "./genlib/notification-preferences/client.js";
import "./genlib/notification-preferences/notification-preferences.css";
```

Adjust the relative prefix to the importing file. The React component has a `use client` directive and does not import server code. In server code only:

```ts
import { createPreferencesHandler } from "./genlib/notification-preferences/server.js";
import type { PreferencesStore } from "./genlib/notification-preferences/server.js";
```

React 18/19 and React types must already be available. The server adapter uses standard Fetch APIs, tested in Node 22+. Route registration belongs to the receiving framework. Do not export the server adapter through a client-facing barrel file.

## Schema and data

Call `createPreferenceSchema` at application startup and share the immutable result between client and server. It rejects duplicate/unsafe keys and unknown channels. Configure 1–32 preference types; each has a stable key (at most 48 characters), label, optional description, allowed channels drawn from `email`, `push`, and `inApp`, and optional boolean defaults. Omitted defaults are **false**.

Example configuration:

```ts
const schema = createPreferenceSchema([
  {
    key: "project_activity",
    label: "Project activity",
    description: "Updates about the projects you follow.",
    channels: ["email", "inApp"],
    defaults: { inApp: true },
  },
]);
```

Both GET output and PUT input have this shape:

```json
{
  "revision": 0,
  "preferences": {
    "project_activity": { "email": false, "inApp": true }
  }
}
```

PUT replaces the complete preference document. Missing or unknown preference types, missing or unknown channels, unknown top-level fields (including user/tenant IDs), non-booleans, and unsafe revisions are rejected. The streamed JSON body is limited to 16,384 bytes. A changed schema requires a migration of existing records and clients; exact validation deliberately does not silently discard preferences.

## Required server adapters

`createPreferencesHandler({ schema, store, authorize, allowedOrigins })` returns a function accepting a `Request` and returning `Promise<Response>`.

**Authorization:** `authorize(request, { action })` must authenticate and authorize the current session for preference access. Derive `{ subject, tenant }` from trusted server authentication and membership context, not JSON or query-string identifiers. For a single-tenant application, derive one fixed tenant identifier in server configuration. Returning `null` denies access; throwing produces a generic service-unavailable response. The handler never supplies a default identity.

**Origin/session protection:** configure exact application origins, for example `https://app.example.com`. Every PUT requires an exact matching `Origin`; missing Origin and `null` Origin are denied. The module sets no CORS permissions. This is one protection for browser requests, not proof of caller identity: a non-browser caller can supply an Origin header. The authorization adapter still must enforce the project's session, CSRF, token, and access policies. Configure HTTPS in production, secure cookie settings if using cookies, and project-appropriate request rate limits. A non-browser service needs the same authorized endpoint policy and an allowed Origin or its own separately reviewed transport adapter.

**Persistence:** provide a real store with `read(identity)` and `compareAndSet(identity, expectedRevision, preferences)`. Both methods must scope access to **both** `subject` and `tenant`. Encode the pair without delimiter collisions. The handler validates returned snapshots but cannot verify that an adapter enforces database isolation or durability.

Implement `compareAndSet` atomically with a database transaction or equivalent:

1. Read the authenticated identity's current row while protecting it from concurrent writes. A missing row represents revision 0 and the schema's defaults.
2. If the requested values already match, return `{ status: "unchanged", snapshot: current }` without a revision increment. This makes repeated identical requests safe, including retries after a lost response.
3. If different values have a stale expected revision, return `{ status: "conflict", snapshot: current }` without a write.
4. Otherwise persist the complete desired values, increment revision by one, and return `{ status: "saved", snapshot: updated }` only after commit.

Do not implement separate unprotected `read` and `write` calls. Two tabs or workers can otherwise overwrite each other. Use a unique database key on the identity tuple and handle concurrent first insertions. After a crash or ambiguous commit result, an identical request is safe only if the adapter satisfies the contract above.

GET returns defaults with revision 0 if no row exists, without writing a row. All responses use `Cache-Control: no-store`. Statuses include 400 for invalid input, 401 for missing/denied identity, 403 for denied origin, 405 for unsupported methods, 409 for stale differing updates (with the current snapshot), 413 for an oversized body, 415 for a non-JSON update, and 503 for adapter failures. Provider exception messages are not sent to clients.

## Client and UI integration

Construct `createPreferencesClient({ endpoint: "/api/notification-preferences", schema })`; call `read()` to load a snapshot and pass `save` to the form. It uses same-origin credentials and rejects invalid response data. The caller owns the initial loading/error state. `PreferencesConflictError` contains the latest validated snapshot; other HTTP failures use `PreferencesRequestError` with a status code.

Render `NotificationPreferencesForm` with `schema`, `initialSnapshot`, `save`, and optional `disabled`. Change its React `key` and reload the snapshot when identity or schema changes: initial state belongs to that mounted identity/schema and does not silently reset when props change. The form disables inputs during saving, guards duplicate submissions, announces status/errors, and retains changes after a failed save. A conflict displays the latest stored choices and asks the user to review before editing again; it never silently overwrites a newer revision.

Import the CSS explicitly in your application's entry point or stylesheet import surface. Map these variables to Brand Kit tokens: `--genlib-notification-font`, `--genlib-notification-text`, `--genlib-notification-border`, `--genlib-notification-radius`, `--genlib-notification-accent`, `--genlib-notification-on-accent`, `--genlib-notification-focus`, and `--genlib-notification-error`. CSS is optional; preserve native labels, fieldsets, focus visibility, and status announcements when restyling.

## Verification

After installing development dependencies, run `npm run build` and `node --test tests/notification-preferences.test.mjs` in this repository. The test file contains a runnable authenticated GET/PUT example with a temporary **test-only** store. That example demonstrates the adapter semantics; copying it into production would not provide persistent storage.

Checks cover authenticated persistence and identity isolation, repeated requests, conflicting updates, rejected origins and identities, rejected unknown fields/channels, bounded bodies, adapter failure redaction, client conflicts, and a React edit/save interaction. In the receiving application, additionally verify the real database's atomic behavior under concurrent workers, session/CSRF controls, signed-out/account-switch behavior, accessibility with project styles, schema migration, and the actual notification service's use of these preferences.
