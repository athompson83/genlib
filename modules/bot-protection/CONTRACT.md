# Bot protection for forms contract

## What installs

| File | Purpose |
| --- | --- |
| `bot-protection/verify.ts` | `createCaptchaVerifier` for Cloudflare Turnstile, hCaptcha and Google reCAPTCHA v2/v3 siteverify |
| `bot-protection/pow.ts` | `createPow` (issue and verify a signed proof-of-work challenge) and `solveChallenge` for browsers and tests |
| `bot-protection/honeypot.ts` | `createHoneypot`: hidden-field trap plus a signed minimum-fill-time token |
| `bot-protection/guard.ts` | `createBotGuard`: runs the configured checks for one form and returns `{ ok, reasons }` |
| `bot-protection/memory-store.ts` | `ReplayStore` interface and the in-process `MemoryReplayStore` |
| `bot-protection/http.ts` | `createChallengeHandler` (GET challenge route) and `protect(handler, guard)` |
| `bot-protection/crypto.ts` | Web Crypto helpers and `BotProtectionError` |

No runtime packages, no environment reads and no network activity at import. There is no SQL in this package.

## When to use it

Use it on public forms that bots abuse: signup, login, password reset requests, contact and comment forms. Pick the layers you need:

- **Honeypot and fill time**: free and invisible, and it stops naive scripts. Always worth adding.
- **Proof of work**: invisible and needs no third party or cookies. The browser spends about a second of CPU, which makes bulk submissions expensive. It is a privacy-friendly alternative to a captcha.
- **Captcha**: Turnstile, hCaptcha or reCAPTCHA, when you already use one of them or need a provider's risk signals. It needs the provider's widget on the page and a network call per submission.

## Integration points

| Hook | You provide |
| --- | --- |
| `secret` | The provider secret from your server secret store |
| `fetch` | `globalThis.fetch` in production and a fake in tests |
| `expectedHostnames`, `expectedAction`, `minScore` | Your site's hosts, the widget action and the reCAPTCHA v3 threshold |
| `key` (pow and honeypot) | Two different random keys of at least 32 bytes |
| `formId` | One server-chosen id per form, such as `signup` |
| `store` | `MemoryReplayStore` on one instance, or an atomic `ReplayStore` (Redis `SET NX PX`, a unique key) |
| `clientIp` | Optional: the visitor IP from a header your own proxy sets |

```ts
import { createCaptchaVerifier } from "./bot-protection/verify";
import { createPow } from "./bot-protection/pow";
import { createHoneypot } from "./bot-protection/honeypot";
import { createBotGuard } from "./bot-protection/guard";
import { MemoryReplayStore } from "./bot-protection/memory-store";
import { createChallengeHandler, protect } from "./bot-protection/http";

const store = new MemoryReplayStore();
const pow = createPow({ key: secrets.powKey });
const honeypot = createHoneypot({ key: secrets.honeypotKey });
const turnstile = createCaptchaVerifier({
  provider: "turnstile", secret: secrets.turnstileSecret, fetch: globalThis.fetch,
  expectedHostnames: ["app.example.com"], expectedAction: "signup",
});

export const challengeRoute = createChallengeHandler({ pow, prefix: "/api/bot", forms: ["signup"] });
const signupGuard = createBotGuard({ formId: "signup", store, pow, honeypot, provider: turnstile });
export const POST = protect(handleSignup, signupGuard, {
  onReject: (result) => log.warn("signup refused", { reasons: result.reasons }),
});

// When rendering the form: const { tokenField, token, fieldName } = await honeypot.issue("signup");
//   <input name={tokenField} type="hidden" value={token} />
//   <input name={fieldName} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-10000px" }} />
// In the browser, before submit:
//   const challenge = await (await fetch("/api/bot/challenge?form=signup")).json();
//   const solved = await solveChallenge(challenge);   // in a Web Worker for large maxNumber
//   form.elements.pow.value = solved.payload;
```

## Behavior

**Captcha (`verify.ts`)**

- `verify(token, { remoteIp?, idempotencyKey? })` POSTs `application/x-www-form-urlencoded` `secret`, `response` and the optional `remoteip` to:
  - Turnstile: `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Only Turnstile also receives `idempotency_key`.
  - hCaptcha: `https://api.hcaptcha.com/siteverify`.
  - reCAPTCHA: `https://www.google.com/recaptcha/api/siteverify`.
- An empty token gives `missing-token` and a token over 4,096 characters gives `invalid-token`. Neither makes a network call.
- A reply with `success: true` must also pass these checks:
  - `hostname` is in `expectedHostnames`, compared case-insensitively.
  - `action` equals `expectedAction` when one is set. This applies to Turnstile and reCAPTCHA v3; hCaptcha refuses the option.
  - For reCAPTCHA, `score >= minScore` (default 0.5). A v2 reply has no score and skips this check. hCaptcha Enterprise scores measure risk, so they are not compared.
  - `challenge_ts` is no older than `maxAgeMs` (default 5 minutes) and no more than one minute in the future.
- Each failure adds one reason: `hostname-mismatch`, `action-mismatch`, `low-score`, `stale` or `invalid-timestamp`.
- Provider `error-codes` map to stable reasons:
  - `invalid-secret`: `missing-input-secret`, `invalid-input-secret`, `sitekey-secret-mismatch`.
  - `missing-token`: `missing-input-response`.
  - `invalid-token`: `invalid-input-response`, `browser-error`.
  - `expired-or-duplicate`: `timeout-or-duplicate`, `already-seen-response`, `expired-input-response`, `invalid-or-already-seen-response`.
  - `bad-request`: `bad-request`, `missing-remoteip`, `invalid-remoteip`.
  - `unavailable`: `internal-error`.
  - `provider-error`: any unknown code. A failure without codes is `rejected`.
- A network error, a timeout (`timeoutMs`, default 10 s), a non-2xx status or an unparseable reply gives `{ ok: false, reasons: ["unavailable"] }`.
- **`failOpen: true` is risky.** It turns those outages into `{ ok: true, failedOpen: true, reasons: ["unavailable"] }`, so bots pass whenever the provider is down. Leave it off unless you have other layers and you monitor `failedOpen`.
- The secret only goes into the request body. It is never logged, returned or included in an error message; configuration errors use fixed text.

**Proof of work (`pow.ts`)**

- `issue(formId)` returns `{ algorithm: "SHA-256", challenge, salt, maxNumber, expires, signature }`, built as follows:
  - `salt` is `<32 hex>?form=<formId>&expires=<epoch ms>`.
  - `challenge` is `hex(SHA-256(salt + secretNumber))`, where `secretNumber` is uniform in `[0, maxNumber]`.
  - `signature` is `hex(HMAC-SHA-256(key, challenge))`.
  - The server stores nothing at issue time. Because the salt is part of the hashed preimage and the challenge is signed, the form and expiry cannot be changed.
- `solveChallenge(challenge)` tries 0 to `maxNumber` and returns `{ number, payload, tookMs }`. `payload` is base64 JSON for the form field, named `pow` by default. `verify` also accepts the decoded object, for JSON bodies.
- `verify(solution, { formId, store })` checks, in order:
  1. The shape, giving `pow-missing` or `pow-malformed`.
  2. The HMAC, with a constant-time compare (`pow-signature`).
  3. The expiry (`pow-expired`).
  4. The form binding (`pow-form`).
  5. `SHA-256(salt + number) === challenge` (`pow-mismatch`).
  6. `store.consume(challenge, expires)` (`pow-replayed`).

  Failed attempts never consume a challenge.
- **Difficulty.** `maxNumber` is 1,000 to 10,000,000 (default 50,000), and a solve takes `maxNumber / 2` hashes on average. Node 22 measured about 20,000 Web Crypto `digest` calls per second on the test machine, so the default takes about 1.3 s on average and 2.5 s at most. 100,000 measured 4.9 s in the worst case. Phones and older browsers can be several times slower, so test on your audience's devices. `ttlMs` defaults to 10 minutes.

**Honeypot (`honeypot.ts`)**

- `issue(formId)` returns a token `<issuedAt>.<hex HMAC(key, "honeypot|formId|issuedAt")>`. Put it in the hidden field `tokenField` (default `form_ts`), and render an empty field `fieldName` (default `website`) that is hidden from people.
- `check` refuses:
  - a non-empty honeypot field (`honeypot-filled`)
  - a missing token (`form-token-missing`)
  - a forged token or one for another form (`form-token-invalid`)
  - a submission sooner than `minFillMs` (default 3 s) after render (`too-fast`)
  - a token older than `maxAgeMs` (default 24 h) (`form-token-expired`)

**Guard (`guard.ts`)**

- `createBotGuard({ formId, store, provider?, pow?, honeypot?, clientIp? })` needs at least one check.
- `check(request, formData)` runs the honeypot, then proof of work, then the captcha. It stops at the first failure, so a tripped honeypot costs no siteverify call.
- The result is `{ ok, reasons }`. Reasons carry a stage prefix, such as `pow:pow-replayed` or `captcha:low-score`, and are for server logs only.
- Token fields default to `cf-turnstile-response`, `h-captcha-response`, `g-recaptcha-response` and `pow`. Override them with `{ verifier, field }` or `{ pow, field }`.

## HTTP routes

| Route | Result |
| --- | --- |
| `GET {prefix}/challenge?form=<formId>` | `200` challenge JSON; `400 {error:"invalid-form"}` for forms not in `forms`; `405` for other methods; `404` for other paths |
| `protect(handler, guard)` on POST, PUT, PATCH or DELETE | the handler's response; `403 {error:"bot-check-failed"}` for every failed check; `413 payload-too-large`; `400 invalid-body`; `415 unsupported-media-type` |

- Every JSON response from these adapters carries `cache-control: no-store`.
- `protect` reads at most `maxBodyBytes` (default 65,536). It refuses an oversized `content-length` before reading, and it stops a stream that grows past the limit.
- It parses `application/x-www-form-urlencoded`, `multipart/form-data` and `application/json` bodies. For a file field, the guard sees only the file name.
- The handler then receives a new `Request` with the same bytes and headers.
- GET, HEAD and OPTIONS pass straight through.
- `onReject(result, request)` gets the hidden reasons for logging.

## Verify

`npm run build && node --test tests/bot-protection.test.mjs` covers these cases:

- each provider through a fake fetch: request shape, success, a wrong or missing hostname, a wrong action, a low score, stale and future timestamps, error-code mapping, and network failure under fail-closed and fail-open
- the secret never appearing in results or thrown errors
- proof of work: issue, solve and verify; tampered signature, another key, another form, changed salt, wrong number, malformed, missing and expired solutions; 10 concurrent replays accepted exactly once; difficulty bounds
- the honeypot field, a too-fast submission and forged, other-form and expired tokens
- the combined guard's order
- `protect()` hiding the reason, handling urlencoded, multipart and JSON bodies, the declared and streamed body limits, and invalid or unsupported bodies
- the challenge route

In the receiving app, add an end-to-end test with the provider's documented test keys, such as Turnstile's always-pass and always-fail secrets, in a non-production environment.

## If something fails

- Every captcha check returns `hostname-mismatch`: `expectedHostnames` lacks the host that renders the widget, such as a preview domain or `localhost` in development.
- Every check returns `unavailable`: the server cannot reach the provider. Check egress rules, DNS and `timeoutMs`. Do not switch on `failOpen` to hide it.
- `pow-replayed` on the first submit: the browser submitted twice, or several instances share a challenge but not a store. Use a shared atomic `ReplayStore`.
- `pow-expired` or `form-token-expired` for slow users: raise `ttlMs` or `maxAgeMs`, or fetch the challenge just before submit.
- Users wait too long: lower `maxNumber` and move `solveChallenge` into a Web Worker.
- Real users trip `too-fast` (password managers, autofill): lower `minFillMs`.

## Limits

- This package does not render captcha widgets, include a SQL or Redis replay store, rate-limit requests or detect account-level abuse. Add the `rate-limit` module on the same routes.
- Provider behavior was tested against fakes that follow the documented response fields, not against live providers.
- Proof of work raises the cost of bulk spam, but it does not stop an attacker with real compute.
- Production secret custody, provider configuration, the accessibility of any visible challenge and consuming-application acceptance remain project responsibilities.
