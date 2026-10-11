# Feature coverage: requirements, evidence and acceptance

Search finds code. It does not prove that a feature works. "Account deletion with a grace period" used to rank a dotted-path utility, and "Stripe checkout and webhooks" a webhook-signature module; both were counted as covered. Feature contracts replace that with a per-requirement account of what Genlib actually provides.

## Contracts

Each file in `resources/feature-contracts/<id>.json` describes one application feature:

```json
{
  "id": "stripe-checkout",
  "title": "Stripe checkout and webhooks",
  "reviewed": "2026-10-11",
  "tasks": ["stripe checkout and webhooks"],
  "requirements": [
    { "id": "create-session", "text": "The server creates a Checkout Session for a price with success and cancel URLs" },
    { "id": "verify-webhook", "text": "Webhook requests are verified against the Stripe-Signature header on the raw body" }
  ],
  "implementations": [
    { "ref": "module:webhook-verification", "status": "fixture-verified", "fulfills": ["verify-webhook"],
      "evidence": [{ "requirement": "verify-webhook", "test": "tests/webhook-verification.test.mjs", "name": "Stripe-Signature: multiple v1" }] },
    { "ref": "module:common-api-clients", "status": "install-supported", "fulfills": ["create-session"] }
  ]
}
```

Requirements describe what a reviewer would require of the feature in a real multi-tenant app, independent of what Genlib happens to have. An implementation is credited only for the requirements it fulfills, at one of these statuses:

| Status | Meaning | Where it comes from |
| --- | --- | --- |
| `cataloged` | Genlib knows where an external resource is | the contract |
| `plan-available` | Genlib documents how to adopt it | the contract |
| `install-supported` | Genlib has a reproducible install or copy path | the contract |
| `fixture-verified` | a named repository test exercises the requirement | the contract, checked by `npm run contracts:check` |
| `application-verified` | the receiving app recorded a passing acceptance command for the requirement | the app's `.genlib/receipts/` |

A contract is **full** when every requirement is at least fixture-verified, **partial** when some are, **unverified** when only lower statuses claim requirements, and **none** otherwise.

`npm run contracts:check` (part of `npm run check`) rejects a contract whose references are not in the catalogs, whose fixture-verified claims lack evidence, or whose evidence names a test file CI does not run or a test title that does not exist. It also requires a contract for every task in `tests/fixtures/gap-tasks.json`.

## Commands

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" coverage stripe checkout and webhooks
node "$GENLIB_ROOT/bin/genlib.mjs" coverage --list
node "$GENLIB_ROOT/bin/genlib.mjs" coverage role-based access control checks --target "$APP_ROOT" --json
```

The text output is one line per requirement with its best status (`app`, `test`, `install`, `plan`, `catalog` or `-`) and the implementation that provides it, then the requirements Genlib does not verify, which are the work left for the app. MCP clients call `genlib_coverage` with `task` (and optionally `target`).

## Recording acceptance in the app

A passing test suite does not show which feature requirements it exercised. Name them:

```sh
node "$GENLIB_ROOT/bin/genlib.mjs" adopted rbac --target "$APP_ROOT" \
  --test "npm test -- tests/admin-permissions.test.ts" \
  --accepts rbac#route-guard,rbac#tenant-scope
```

The keys must be requirements the module claims in its contract. The receipt records them with the command and exit code. They count as `application-verified` only when the command passed and app code imports the module. A later failing run for the same keys withdraws the acceptance.

## Writing a contract

1. List 3 to 8 observable requirements, including authorization, idempotency, concurrency and input validation where the feature has them.
2. For each implementation, credit only what it does. Open the test file, confirm the test exercises the requirement, and cite a substring of its title.
3. Evidence must be a test CI runs: `tests/*.test.mjs`, or `integrations/<pack>/tests/*.test.mjs` for a pack in the `node-packs` matrix of `.github/workflows/integration-profiles.yml` (the validator reads the matrix, so a pack dropped from CI stops counting). Capabilities tested only in per-language suites under `examples/` stay `install-supported` until a test in one of those places exercises the requirement.
4. Leave uncovered requirements uncovered, and name the existing building blocks in `notes`.
5. Run `npm run contracts:check` and `node scripts/gap-report.mjs --write`.

[gaps.md](gaps.md) is the generated summary for all common tasks.
