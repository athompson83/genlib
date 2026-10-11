Add scheduled daily digests to this app (teamnotes, TypeScript on Node 22, see README.md).

First create `src/mailer.ts` exactly as follows; tests replace `send`, so always call it through `mailer.`:

```ts
export const mailer = {
  send: async (message: { to: string; subject: string; text: string }): Promise<void> => { console.log('mail', message.to, message.subject) },
}
```

- `PUT /tenants/:tenantId/digest` (tenant admins only, others 403) with `{ "time": "HH:MM", "timeZone": "<IANA zone>" }` sets the tenant's daily digest time, 24-hour wall-clock time in that zone. Respond `200 { time, timeZone }`. Respond `400 { "error": "invalid_digest" }` for a malformed time or an unknown time zone. `DELETE` on the same path turns the digest off (`204`).
- Export `tick(): Promise<void>` from `src/digests.ts`. The app calls it every minute from several processes that share the database, so calls can overlap. Each call sends every digest that is due at `clock.now()`.
- A tenant's digest for a calendar day (in its time zone) is due from that day's digest time onwards. It sends one email per tenant member, `subject` = `Daily digest for <tenant name>`, `text` listing the titles of notes created since the previous digest (or since the digest was set).
- Each tenant's digest for a given day is sent at most once, even when `tick()` calls overlap.
- On a day when the digest time does not exist because clocks move forward, it is due at the first instant after the gap. On a day when the time occurs twice because clocks move back, it is sent once, at the first occurrence.
- After downtime, send only the most recent missed digest, not one per missed day.
- If `mailer.send` throws, retry that digest on later `tick()` calls, at most 3 attempts in total; members already sent to are not sent to again.

Persist new state in the in-memory database (`src/db.ts`: add it to `Db` and `seed()` so `resetDb()` clears it). Do not add runtime dependencies. Keep existing behavior, add tests for the new behavior, and make `npm test` pass.
