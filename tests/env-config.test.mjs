// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { inspect } from "node:util";
import {
  ConfigError, REDACTED, bool, defineConfig, json, list, num, secret, str, url,
} from "../.build/modules/env-config/files/config.js";

const SECRET = "sk-live-DO-NOT-LEAK-9f8e7d";

const schema = () => defineConfig({
  NODE_ENV: str({ choices: ["development", "production", "test"], default: "development" }).describe("Runtime mode"),
  PORT: num({ integer: true, min: 1, max: 65535, default: 3000 }),
  DEBUG: bool({ default: false }),
  PUBLIC_URL: url({ protocols: ["https"] }),
  API_KEY: secret({ minLength: 10 }).describe("Provider key"),
  ALLOWED_ORIGINS: list({ default: ["https://a.example"] }),
  FEATURE_FLAGS: json().optional(),
  REGION: str({ pattern: /^[a-z]{2}-[a-z]+-\d$/g }).optional(),
});

const valid = { PUBLIC_URL: "https://app.example", API_KEY: SECRET };

test("parses a valid source with defaults and returns a frozen object", () => {
  const config = schema().parse(valid);
  assert.equal(config.NODE_ENV, "development");
  assert.equal(config.PORT, 3000);
  assert.equal(config.DEBUG, false);
  assert.equal(config.PUBLIC_URL, "https://app.example");
  assert.equal(config.API_KEY, SECRET);
  assert.deepEqual(config.ALLOWED_ORIGINS, ["https://a.example"]);
  assert.equal(config.FEATURE_FLAGS, undefined);
  assert.equal(config.REGION, undefined);
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.ALLOWED_ORIGINS));
  assert.throws(() => { "use strict"; config.PORT = 1; }, TypeError);
  assert.deepEqual(Object.keys(config).sort(), Object.keys(schema().schema).sort());
});

test("converts typed values and parses each field kind", () => {
  const config = schema().parse({
    ...valid, NODE_ENV: "production", PORT: "8080", DEBUG: "1",
    ALLOWED_ORIGINS: " https://a.example , ,https://b.example ", FEATURE_FLAGS: '{"beta":true}', REGION: "us-east-1",
  });
  assert.equal(config.NODE_ENV, "production");
  assert.equal(config.PORT, 8080);
  assert.equal(config.DEBUG, true);
  assert.deepEqual(config.ALLOWED_ORIGINS, ["https://a.example", "https://b.example"]);
  assert.deepEqual(config.FEATURE_FLAGS, { beta: true });
  // A global-flag pattern stays deterministic across repeated parses.
  assert.equal(schema().parse({ ...valid, REGION: "us-east-1" }).REGION, "us-east-1");
  // Vite-style typed values are accepted.
  assert.equal(defineConfig({ PORT: num(), DEV: bool() }).parse({ PORT: 5173, DEV: true }).DEV, true);
});

test("booleans accept true/false/1/0/yes/no/on/off case-insensitively and reject others", () => {
  const def = defineConfig({ FLAG: bool() });
  for (const raw of ["true", "TRUE", "1", "yes", "On", " true "]) assert.equal(def.parse({ FLAG: raw }).FLAG, true, raw);
  for (const raw of ["false", "False", "0", "no", "OFF"]) assert.equal(def.parse({ FLAG: raw }).FLAG, false, raw);
  assert.throws(() => def.parse({ FLAG: "maybe" }), error => error instanceof ConfigError && error.issues[0].key === "FLAG");
});

test("aggregates every problem by key in one ConfigError", () => {
  const result = schema().safeParse({
    NODE_ENV: "staging", PORT: "99999", DEBUG: "perhaps", PUBLIC_URL: "http://insecure.example",
    API_KEY: "short", FEATURE_FLAGS: "{not json", REGION: "Mars",
  });
  assert.equal(result.ok, false);
  const { error } = result;
  assert.ok(error instanceof ConfigError);
  assert.deepEqual(error.issues.map(issue => issue.key),
    ["NODE_ENV", "PORT", "DEBUG", "PUBLIC_URL", "API_KEY", "FEATURE_FLAGS", "REGION"]);
  assert.match(error.message, /7 problems/);
  for (const issue of error.issues) assert.ok(error.message.includes(`${issue.key}: ${issue.message}`));
  assert.ok(Object.isFrozen(error.issues));

  const missing = schema().safeParse({});
  assert.deepEqual(missing.error.issues, [
    { key: "PUBLIC_URL", message: "is required" },
    { key: "API_KEY", message: "is required" },
  ]);
});

test("numbers reject hex, empty-ish, and non-integer input", () => {
  const def = defineConfig({ N: num({ integer: true }) });
  for (const raw of ["0x10", "1.5", "abc", "Infinity", "1e400"]) {
    assert.throws(() => def.parse({ N: raw }), ConfigError, raw);
  }
  assert.equal(def.parse({ N: "-42" }).N, -42);
});

test("empty strings count as missing and non-primitive values are rejected", () => {
  const def = defineConfig({ A: str({ default: "x" }), B: str().optional(), C: str() });
  assert.deepEqual({ ...def.parse({ A: "", B: "", C: "c" }) }, { A: "x", B: undefined, C: "c" });
  const result = def.safeParse({ C: { binding: true } });
  assert.deepEqual(result.error.issues, [{ key: "C", message: "must be a string value" }]);
});

test("unknown keys and prototype names are ignored", () => {
  const def = defineConfig({ constructor: str().optional(), A: str() });
  const config = def.parse({ A: "a", EXTRA: "ignored", PATH: "/usr/bin" });
  assert.equal(config.constructor, undefined);
  assert.equal(Object.hasOwn(config, "EXTRA"), false);
  assert.equal(Object.hasOwn(config, "PATH"), false);
});

test("secret values never appear in errors, JSON, toString, inspection, describe, or examples", () => {
  const def = defineConfig({
    API_KEY: secret({ pattern: /^sk-test-/ }),
    TOKEN_JSON: json({ validate: () => { throw new Error(`bad ${SECRET}`); } }).secret(),
    DB_URL: url().secret(),
  });
  const result = def.safeParse({ API_KEY: SECRET, TOKEN_JSON: `{"k":"${SECRET}"}`, DB_URL: `not a url ${SECRET}` });
  assert.equal(result.ok, false);
  const surfaces = [
    result.error.message, String(result.error), JSON.stringify(result.error), inspect(result.error, { depth: 5 }),
    result.error.stack ?? "", JSON.stringify(result.error.issues),
  ];
  for (const text of surfaces) assert.equal(text.includes(SECRET), false, text);

  const ok = defineConfig({ API_KEY: secret(), NAME: str() }).parse({ API_KEY: SECRET, NAME: "app" });
  assert.equal(ok.API_KEY, SECRET);
  for (const text of [JSON.stringify(ok), String(ok), inspect(ok), `${ok}`]) assert.equal(text.includes(SECRET), false, text);
  assert.deepEqual(JSON.parse(JSON.stringify(ok)), { API_KEY: REDACTED, NAME: "app" });

  const withDefault = defineConfig({ API_KEY: str({ default: SECRET }).secret() });
  assert.equal(withDefault.toExample().includes(SECRET), false);
  assert.equal(JSON.stringify(withDefault.describe()).includes(SECRET), false);
  assert.deepEqual(withDefault.redact(withDefault.parse({})), { API_KEY: REDACTED });
});

test("invalid non-secret values are not echoed either", () => {
  const value = "visible-but-unechoed-value";
  const result = defineConfig({ MODE: str({ choices: ["a", "b"] }) }).safeParse({ MODE: value });
  assert.equal(result.error.message.includes(value), false);
  assert.match(result.error.message, /MODE: must be one of: a, b/);
});

test("renders a .env.example and a structured description", () => {
  const def = defineConfig({
    NODE_ENV: str({ choices: ["development", "production"], default: "development" }).describe("Runtime mode"),
    PORT: num({ integer: true, default: 3000 }),
    API_KEY: secret().describe("Provider key"),
    GREETING: str().example("hello world"),
    ORIGINS: list({ default: ["https://a.example", "https://b.example"] }),
  });
  assert.equal(def.toExample(), [
    "# Runtime mode",
    "# one of development | production; optional; default: development",
    "NODE_ENV=development",
    "",
    "# integer; optional; default: 3000",
    "PORT=3000",
    "",
    "# Provider key",
    "# string; required; secret",
    "API_KEY=",
    "",
    "# string; required",
    "GREETING=\"hello world\"",
    "",
    "# list separated by \",\"; optional; default: https://a.example,https://b.example",
    "ORIGINS=https://a.example,https://b.example",
    "",
  ].join("\n"));
  const described = def.describe();
  assert.deepEqual(described.find(item => item.key === "API_KEY"),
    { key: "API_KEY", kind: "string", hint: "string", required: true, secret: true, description: "Provider key" });
  assert.equal(described.find(item => item.key === "PORT").default, 3000);
});

test("rejects invalid schemas and sources at definition time", () => {
  assert.throws(() => defineConfig({ "BAD-NAME": str() }), TypeError);
  assert.throws(() => defineConfig({ A: "not a field" }), TypeError);
  assert.throws(() => str({ choices: [] }), TypeError);
  assert.throws(() => url({ protocols: ["ht tp"] }), TypeError);
  assert.throws(() => defineConfig({ A: str() }).parse(null), TypeError);
});
