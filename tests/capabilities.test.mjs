// SPDX-License-Identifier: Apache-2.0
// Vector tests for the Tier A capability recipes (totp, oidc-pkce, recovery-codes, calculator,
// form-schema). Compiled with the same generated-tsconfig approach and strict flags as
// tests/recipes.test.mjs, then imported as ES modules.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['totp', 'oidc-pkce', 'recovery-codes', 'calculator', 'form-schema'];
const out = mkdtempSync(join(tmpdir(), 'genlib-capabilities-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.capabilities.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const ascii = (s) => new TextEncoder().encode(s);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;

test('capability recipes are registered and routed', () => {
  const entries = JSON.parse(readFileSync(join(root, 'resources/agent-recipes.json'), 'utf8')).entries;
  for (const n of names) assert.ok(entries.some((e) => e.path === `examples/recipes/${n}.ts`), n);
  assert.equal(findTop('totp'), 'totp-mfa-codes');
  assert.equal(findTop('pkce'), 'oidc-pkce-authorization-request');
  assert.equal(findTop('backup', 'codes'), 'mfa-recovery-codes');
  assert.equal(findTop('loan', 'calculator'), 'safe-calculator-and-loan-math');
  assert.equal(findTop('form', 'validation'), 'form-schema-validation');
});

test('totp: RFC 4226 HOTP vectors', async () => {
  const { hotp } = await load('totp');
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  for (let c = 0; c < 10; c++) assert.equal(await hotp(ascii('12345678901234567890'), c), expected[c]);
  await assert.rejects(hotp(ascii('x'), -1), RangeError);
  await assert.rejects(hotp(ascii('x'), 0, 5), RangeError);
});

test('totp: RFC 6238 Appendix B vectors (8 digits, SHA1/SHA256/SHA512)', async () => {
  const { totp } = await load('totp');
  const secrets = {
    SHA1: ascii('12345678901234567890'),
    SHA256: ascii('12345678901234567890123456789012'),
    SHA512: ascii('1234567890123456789012345678901234567890123456789012345678901234'),
  };
  const table = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  for (const [t, sha1, sha256, sha512] of table) {
    assert.equal(await totp(secrets.SHA1, t, { digits: 8, algorithm: 'SHA1' }), sha1);
    assert.equal(await totp(secrets.SHA256, t, { digits: 8, algorithm: 'SHA256' }), sha256);
    assert.equal(await totp(secrets.SHA512, t, { digits: 8, algorithm: 'SHA512' }), sha512);
  }
});

test('totp: verify window, base32, otpauth URI and secret generation', async () => {
  const t = await load('totp');
  const secret = ascii('12345678901234567890');
  const opts = { digits: 8, algorithm: 'SHA1' };
  const code = await t.totp(secret, 59, opts);
  assert.equal(await t.verifyTotp(code, secret, 59, opts), true);
  assert.equal(await t.verifyTotp(code, secret, 89, opts), true);
  assert.equal(await t.verifyTotp(code, secret, 150, opts), false);
  assert.equal(await t.verifyTotp('abc', secret, 59, opts), false);
  assert.equal(await t.verifyTotp('1234567', secret, 59, opts), false);
  assert.equal(await t.verifyTotp(code, secret, 89, { ...opts, window: 0 }), false);
  assert.equal(t.base32Encode(ascii('foobar')), 'MZXW6YTBOI');
  assert.equal(new TextDecoder().decode(t.base32Decode('mzxw 6ytb-oi==')), 'foobar');
  assert.throws(() => t.base32Decode('MZ1'), /Invalid base32/);
  assert.equal(t.otpauthUri('Acme Co', 'alice@example.com', 'JBSWY3DPEHPK3PXP'),
    'otpauth://totp/Acme%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme%20Co&algorithm=SHA1&digits=6&period=30');
  const generated = t.generateSecret();
  assert.equal(generated.length, 20);
  assert.deepEqual(t.base32Decode(t.base32Encode(generated)), generated);
  assert.throws(() => t.generateSecret(8), RangeError);
});

test('oidc-pkce: RFC 7636 challenge, verifier and random tokens', async () => {
  const o = await load('oidc-pkce');
  assert.equal(await o.codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  const verifier = o.generateCodeVerifier();
  assert.equal(verifier.length, 64);
  assert.match(verifier, /^[A-Za-z0-9._~-]+$/);
  assert.equal(o.generateCodeVerifier(43).length, 43);
  assert.equal(o.generateCodeVerifier(128).length, 128);
  assert.throws(() => o.generateCodeVerifier(42), RangeError);
  assert.throws(() => o.generateCodeVerifier(129), RangeError);
  const token = o.randomToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(o.randomToken(), token);
});

test('oidc-pkce: authorization URL, callback parsing and token body', async () => {
  const o = await load('oidc-pkce');
  const base = { clientId: 'app 1', redirectUri: 'https://app.example.com/cb', scope: ['openid', 'email'], state: 's1', nonce: 'n1', codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM' };
  assert.equal(o.buildAuthorizationUrl({ ...base, authorizationEndpoint: 'https://id.example.com/authorize' }),
    'https://id.example.com/authorize?response_type=code&client_id=app%201&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&scope=openid%20email&state=s1&nonce=n1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256');
  assert.throws(() => o.buildAuthorizationUrl({ ...base, authorizationEndpoint: 'http://id.example.com/authorize' }), /https/);
  assert.match(o.buildAuthorizationUrl({ ...base, authorizationEndpoint: 'http://localhost:8080/authorize' }), /^http:\/\/localhost:8080\/authorize\?response_type=code&/);
  assert.match(o.buildAuthorizationUrl({ ...base, authorizationEndpoint: 'http://127.0.0.1/authorize' }), /^http:\/\/127\.0\.0\.1\/authorize\?/);
  const withQuery = o.buildAuthorizationUrl({ ...base, scope: 'openid profile', authorizationEndpoint: 'https://id.example.com/authorize?tenant=a', extraParams: [['prompt', 'login'], ['ui_locales', 'en fr']] });
  assert.match(withQuery, /^https:\/\/id\.example\.com\/authorize\?tenant=a&response_type=code&/);
  assert.match(withQuery, /scope=openid%20profile&/);
  assert.match(withQuery, /code_challenge_method=S256&prompt=login&ui_locales=en%20fr$/);
  assert.throws(() => o.buildAuthorizationUrl({ ...base, scope: ['email'], authorizationEndpoint: 'https://id.example.com/a' }), /openid/);
  assert.throws(() => o.buildAuthorizationUrl({ ...base, authorizationEndpoint: 'https://id.example.com/a', extraParams: { state: 'x' } }), /override/);

  assert.deepEqual(o.parseCallback('https://app.example.com/cb?code=abc&state=s1', 's1'), { code: 'abc' });
  assert.throws(() => o.parseCallback('https://app.example.com/cb?code=abc&state=s1', 's2'), (e) => e instanceof o.OAuthCallbackError && e.error === 'state_mismatch');
  assert.throws(() => o.parseCallback('https://app.example.com/cb?error=access_denied&error_description=User%20denied&state=s1', 's1'),
    (e) => e.error === 'access_denied' && e.errorDescription === 'User denied');
  assert.throws(() => o.parseCallback('https://app.example.com/cb?state=s1', 's1'), (e) => e.error === 'missing_code');
  assert.throws(() => o.parseCallback('https://app.example.com/cb?code=a&code=b&state=s1', 's1'), (e) => e.error === 'invalid_callback');

  assert.equal(o.tokenRequestBody({ code: 'c d', redirectUri: 'https://app.example.com/cb', clientId: 'app', codeVerifier: 'v' }),
    'grant_type=authorization_code&code=c+d&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&client_id=app&code_verifier=v');
});

test('recovery-codes: normalize, hash, generate and find', async () => {
  const r = await load('recovery-codes');
  assert.equal(r.normalizeRecoveryCode(' 7k3qx-9mnp2 '), '7K3QX9MNP2');
  assert.equal(r.normalizeRecoveryCode('ABCDE-FGHIO'), 'ABCDEFGH10');
  assert.throws(() => r.normalizeRecoveryCode('ABCDE-FGHIU'), /character/);
  assert.throws(() => r.normalizeRecoveryCode('ABC'), /10 characters/);
  const key = ascii('pepper');
  const hex = 'b6a0f9ca8ffdc4e8e3268b490bb8beeda45f367550751b8cb151636dad869138';
  assert.equal(createHmac('sha256', 'pepper').update('7K3QX9MNP2').digest('hex'), hex);
  assert.equal(await r.hashRecoveryCode('7K3QX-9MNP2', key), hex);
  const codes = r.generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) assert.match(code, /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
  const hashes = await Promise.all(codes.slice(0, 3).map((c) => r.hashRecoveryCode(c, key)));
  assert.equal(await r.findRecoveryCode(codes[2].toLowerCase(), hashes, key), 2);
  assert.equal(await r.findRecoveryCode(codes[5], hashes, key), -1);
  assert.equal(await r.findRecoveryCode('not a code', hashes, key), -1);
  assert.match(r.generateRecoveryCodes(3, { groups: 3, groupLength: 4 })[0], /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
});

test('calculator: evaluate vectors and errors', async () => {
  const { evaluate, CalculatorError } = await load('calculator');
  assert.equal(evaluate('2 + 3 * 4'), 14);
  assert.equal(evaluate('(2+3)*4'), 20);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('10 % 4'), 2);
  assert.equal(evaluate('-7 % 3'), -1);
  assert.equal(evaluate('1.5e2 / 3'), 50);
  assert.equal(evaluate('a*2+b', { a: 3, b: 0.5 }), 6.5);
  assert.equal(evaluate('2^-1'), 0.5);
  for (const bad of ['1/0', '2 % 0', '(1+2', '1+', 'x+1', '', '1 + 2)', '1 2', '2 $ 3', 'constructor', '1e308*10', '1'.repeat(1001)]) {
    assert.throws(() => evaluate(bad), CalculatorError, JSON.stringify(bad.slice(0, 20)));
  }
});

test('calculator: loan payment, amortization and compound interest', async () => {
  const c = await load('calculator');
  assert.equal(c.loanPayment(200000, 6, 360), 1199.10);
  assert.equal(c.loanPayment(10000, 0, 10), 1000.00);
  assert.equal(c.loanPayment(1000, 12, 12), 88.85);
  const rows = c.amortizationSchedule(1000, 12, 12);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows[0], { period: 1, payment: 88.85, interest: 10.00, principal: 78.85, balance: 921.15 });
  assert.equal(rows.at(-1).balance, 0);
  assert.equal(c.roundCents(rows.reduce((s, r) => s + r.principal, 0)), 1000.00);
  const big = c.amortizationSchedule(200000, 6, 360);
  assert.equal(big.at(-1).balance, 0);
  assert.equal(c.roundCents(big.reduce((s, r) => s + r.principal, 0)), 200000);
  assert.equal(c.compoundInterest(1000, 5, 12, 10), 1647.01);
  assert.equal(c.roundCents(1.005), 1.01);
  assert.equal(c.roundCents(-2.675), -2.68);
  assert.throws(() => c.loanPayment(1000, 5, 0), RangeError);
});

test('form-schema: validation vectors', async () => {
  const { validate } = await load('form-schema');
  const S = [
    { name: 'name', type: 'string', required: true, minLength: 2, maxLength: 5 },
    { name: 'age', type: 'integer', min: 18, max: 120 },
    { name: 'email', type: 'email', required: true },
    { name: 'plan', type: 'string', enum: ['free', 'pro'] },
    { name: 'code', type: 'string', pattern: '[A-Z]{3}-\\d{2}' },
    { name: 'start', type: 'date' },
  ];
  const v = (values, allowUnknown) => Object.fromEntries(validate(S, values, allowUnknown));
  assert.deepEqual(v({ name: 'Al', age: 30, email: 'a@b.co', plan: 'pro', code: 'ABC-12', start: '2024-02-29' }), {});
  assert.deepEqual(v({ name: '', email: 'bad' }), { name: ['required'], email: ['email'] });
  const third = validate(S, { name: 'Abcdef', age: 17.5, email: 'a@b.co', plan: 'team', code: 'abc-12', start: '2023-02-29' });
  assert.deepEqual([...third.keys()], ['name', 'age', 'plan', 'code', 'start']);
  assert.deepEqual(Object.fromEntries(third), { name: ['maxLength'], age: ['type'], plan: ['enum'], code: ['pattern'], start: ['date'] });
  assert.deepEqual(v({ name: 'Al', email: 'a@b.co', age: '30' }), { age: ['type'] });
  assert.deepEqual(v({ name: 'Al', email: 'a@b.co', extra: 1 }), { extra: ['unknown'] });
  assert.deepEqual(v({ name: 'Al', email: 'a@b.co', extra: 1 }, true), {});
  assert.deepEqual(v({ name: 'Al', email: 'a@b.co', age: 121 }), { age: ['max'] });
  assert.deepEqual(v({ name: 'Ā', email: 'a@b.co' }), { name: ['minLength'] });
  assert.deepEqual(v({ name: null, email: 'a@b.co', age: true, start: '1900-02-29' }), { name: ['required'], age: ['type'], start: ['date'] });
  assert.deepEqual(v({ name: 'Al', email: 'a@@b.co' }), { email: ['email'] });
  assert.deepEqual(v({ name: 'Al', email: 'a@b.co', start: '2000-02-29', code: 'ABC-12x' }), { code: ['pattern'] });
  assert.throws(() => validate([{ name: 'x', type: 'string' }, { name: 'x', type: 'number' }], {}), /duplicate/);
});
