// SPDX-License-Identifier: Apache-2.0
// Original ALTCHA-style proof-of-work challenge. The server stays stateless until verification:
//   salt      = <random hex>?form=<formId>&expires=<epoch ms>
//   challenge = hex(SHA-256(salt + secretNumber)), secretNumber uniform in [0, maxNumber]
//   signature = hex(HMAC-SHA-256(serverKey, challenge))
// The browser searches 0..maxNumber for the number (solveChallenge). Because the salt is inside the hashed
// preimage and the challenge is signed, neither the form binding nor the expiry can be altered.
// Expected work: on average maxNumber / 2 SHA-256 hashes, at most maxNumber + 1.
import { assertFormId, BotProtectionError, hmacHex, importHmacKey, keyBytes, randomHex, randomInt, sha256Hex, timingSafeEqualText } from "./crypto.js";
import type { ReplayStore } from "./memory-store.js";

export const POW_ALGORITHM = "SHA-256";
export const MIN_MAX_NUMBER = 1_000;
export const MAX_MAX_NUMBER = 10_000_000;
export const DEFAULT_MAX_NUMBER = 50_000;

export interface PowChallenge {
  readonly algorithm: "SHA-256";
  readonly challenge: string;
  readonly salt: string;
  readonly maxNumber: number;
  /** Epoch milliseconds after which the solution is refused. */
  readonly expires: number;
  readonly signature: string;
}

export interface PowSolution {
  readonly algorithm: "SHA-256";
  readonly challenge: string;
  readonly salt: string;
  readonly number: number;
  readonly signature: string;
}

export type PowReason = "pow-missing" | "pow-malformed" | "pow-signature" | "pow-expired" | "pow-form" | "pow-mismatch" | "pow-replayed";

export interface PowResult {
  readonly ok: boolean;
  readonly reasons: readonly PowReason[];
}

export interface PowOptions {
  /** Server HMAC key, at least 32 bytes. Keep it out of the browser and rotate it like a session secret. */
  readonly key: string | Uint8Array;
  /** Difficulty: the largest secret number, 1,000 to 10,000,000. Default 50,000 (about 1.3 s average, 2.5 s worst case at ~20,000 Web Crypto hashes per second). */
  readonly maxNumber?: number;
  /** How long an issued challenge stays valid. Default 10 minutes, at most 24 hours. */
  readonly ttlMs?: number;
  /** Clock in epoch milliseconds. Default Date.now. */
  readonly now?: () => number;
  /** Secret number source for tests; must return an integer in [0, max]. Default Web Crypto. */
  readonly randomNumber?: (max: number) => number;
}

export interface VerifyPowOptions {
  /** The form this endpoint serves, from your server code, never from the request. */
  readonly formId: string;
  readonly store: ReplayStore;
}

export interface Pow {
  readonly maxNumber: number;
  issue(formId: string): Promise<PowChallenge>;
  verify(solution: unknown, options: VerifyPowOptions): Promise<PowResult>;
}

const HEX64 = /^[0-9a-f]{64}$/;
const SALT = /^[0-9a-f]{32}\?form=([A-Za-z0-9_.-]{1,64})&expires=(\d{1,16})$/;
const fail = (reason: PowReason): PowResult => ({ ok: false, reasons: [reason] });

function checkMaxNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < MIN_MAX_NUMBER || value > MAX_MAX_NUMBER) {
    throw new BotProtectionError("invalid-config", `maxNumber must be an integer from ${MIN_MAX_NUMBER} to ${MAX_MAX_NUMBER}`);
  }
  return value;
}

/** Decode a solution sent as base64 JSON (the form-field format solveChallenge produces) or as an object. */
export function decodeSolution(value: unknown): PowSolution | null {
  let candidate: unknown = value;
  if (typeof value === "string") {
    if (value.length === 0 || value.length > 2048) return null;
    try { candidate = JSON.parse(atob(value)); } catch { return null; }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const s = candidate as Record<string, unknown>;
  if (s.algorithm !== POW_ALGORITHM || typeof s.challenge !== "string" || typeof s.salt !== "string" ||
    typeof s.signature !== "string" || typeof s.number !== "number" || !Number.isSafeInteger(s.number) || s.number < 0) return null;
  return { algorithm: POW_ALGORITHM, challenge: s.challenge, salt: s.salt, number: s.number, signature: s.signature };
}

export function encodeSolution(solution: PowSolution): string {
  return btoa(JSON.stringify(solution));
}

export function createPow(options: PowOptions): Pow {
  const key = importHmacKey(keyBytes(options.key, "Proof-of-work key"));
  const maxNumber = checkMaxNumber(options.maxNumber ?? DEFAULT_MAX_NUMBER);
  const ttl = options.ttlMs ?? 10 * 60_000;
  if (!Number.isSafeInteger(ttl) || ttl < 1000 || ttl > 86_400_000) throw new BotProtectionError("invalid-config", "ttlMs must be 1 second to 24 hours");
  const now = options.now ?? Date.now;
  const pick = options.randomNumber ?? randomInt;

  async function issue(formId: string): Promise<PowChallenge> {
    assertFormId(formId);
    const expires = now() + ttl;
    const salt = `${randomHex(16)}?form=${formId}&expires=${expires}`;
    const secretNumber = pick(maxNumber);
    if (!Number.isSafeInteger(secretNumber) || secretNumber < 0 || secretNumber > maxNumber) throw new BotProtectionError("invalid-config", "randomNumber returned a value out of range");
    const challenge = await sha256Hex(salt + secretNumber);
    const signature = await hmacHex(await key, challenge);
    return { algorithm: POW_ALGORITHM, challenge, salt, maxNumber, expires, signature };
  }

  async function verify(raw: unknown, call: VerifyPowOptions): Promise<PowResult> {
    assertFormId(call.formId);
    if (raw === undefined || raw === null || raw === "") return fail("pow-missing");
    const solution = decodeSolution(raw);
    if (!solution || !HEX64.test(solution.challenge) || !HEX64.test(solution.signature) || solution.number > MAX_MAX_NUMBER) return fail("pow-malformed");
    const match = SALT.exec(solution.salt);
    if (!match) return fail("pow-malformed");
    const expected = await hmacHex(await key, solution.challenge);
    if (!timingSafeEqualText(expected, solution.signature)) return fail("pow-signature");
    if (Number(match[2]) <= now()) return fail("pow-expired");
    if (match[1] !== call.formId) return fail("pow-form");
    const hash = await sha256Hex(solution.salt + solution.number);
    if (!timingSafeEqualText(hash, solution.challenge)) return fail("pow-mismatch");
    // Single use: consumed only after every other check passed, so failed attempts do not burn a challenge.
    if (!(await call.store.consume(solution.challenge, Number(match[2])))) return fail("pow-replayed");
    return { ok: true, reasons: [] };
  }

  return { maxNumber, issue, verify };
}

export interface SolveOptions {
  /** Stop searching early; solveChallenge then returns null. */
  readonly signal?: AbortSignal;
}

export interface SolveResult {
  readonly number: number;
  /** Base64 JSON to put in the form field (default name "pow"). */
  readonly payload: string;
  readonly tookMs: number;
}

/**
 * Browser and test solver: try 0..maxNumber until SHA-256(salt + n) equals the challenge.
 * Uses Web Crypto only. Run it in a Web Worker for large maxNumber so the page stays responsive.
 */
export async function solveChallenge(challenge: PowChallenge, options: SolveOptions = {}): Promise<SolveResult | null> {
  const started = Date.now();
  const encoder = new TextEncoder();
  const target = challenge.challenge.toLowerCase();
  const limit = Math.min(challenge.maxNumber, MAX_MAX_NUMBER);
  for (let n = 0; n <= limit; n++) {
    if (options.signal?.aborted) return null;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(challenge.salt + n)));
    let hex = "";
    for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
    if (hex === target) {
      const payload = encodeSolution({ algorithm: POW_ALGORITHM, challenge: challenge.challenge, salt: challenge.salt, number: n, signature: challenge.signature });
      return { number: n, payload, tookMs: Date.now() - started };
    }
  }
  return null;
}
