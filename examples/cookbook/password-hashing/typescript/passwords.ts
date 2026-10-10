// SPDX-License-Identifier: Apache-2.0
// Argon2id password hashing via node-argon2 (prebuilt N-API binaries for
// common platforms). OWASP Password Storage Cheat Sheet minimum for Argon2id:
// m=19456 KiB (19 MiB), t=2, p=1. Hashes are PHC strings.
// bcryptjs is an optional pure-JS fallback/legacy reader (72-byte input limit).
import argon2 from 'argon2';
import bcrypt from 'bcryptjs';

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export interface VerifyResult {
  ok: boolean;
  /** Persist this when set: legacy bcrypt or outdated Argon2 parameters. */
  rehash?: string;
}

export async function verifyPassword(stored: string, password: string): Promise<VerifyResult> {
  if (/^\$2[aby]\$/.test(stored)) {
    const ok = await bcrypt.compare(password, stored);
    return ok ? { ok, rehash: await hashPassword(password) } : { ok: false };
  }
  let ok = false;
  try {
    ok = await argon2.verify(stored, password);
  } catch {
    return { ok: false }; // malformed or unsupported hash
  }
  if (!ok) return { ok: false };
  const { memoryCost, timeCost, parallelism } = ARGON2_OPTIONS;
  const outdated = !stored.startsWith('$argon2id$') || argon2.needsRehash(stored, { memoryCost, timeCost, parallelism });
  return outdated ? { ok, rehash: await hashPassword(password) } : { ok };
}

/** Fallback when the native argon2 addon cannot be installed. OWASP: cost >= 10. */
export function bcryptHash(password: string, cost = 12): Promise<string> {
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return Promise.reject(new Error('bcrypt truncates input over 72 bytes'));
  }
  return bcrypt.hash(password, cost);
}
