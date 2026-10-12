// SPDX-License-Identifier: Apache-2.0
// Modules copied into apps that run TypeScript without a build (Node type stripping): erasable syntax only, and
// --ts-imports rewrites relative `.js` specifiers to `.ts` so the copied files load as they are.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadCatalog, REPOSITORY_ROOT } from '../lib/catalog.mjs';
import { installModule, planInstall, transformSource, verifyInstallation } from '../lib/install.mjs';
import { updateModule } from '../lib/lifecycle.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function app(t) {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-strip-'));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }));
  return target;
}

test('transformSource rewrites only relative .js specifiers in .ts files', () => {
  const source = Buffer.from([
    'import { a } from "./a.js";', "export * from '../b/c.js';", 'import type { T } from "./t.js";',
    'const m = await import("./lazy.js");', 'import "./side.js";', 'import x from "pkg/x.js";', 'const s = "./not-an-import.js";',
  ].join('\n'));
  const out = transformSource(source, 'x/y.ts', { tsImports: true }).toString();
  assert.match(out, /from "\.\/a\.ts"/);
  assert.match(out, /from '\.\.\/b\/c\.ts'/);
  assert.match(out, /from "\.\/t\.ts"/);
  assert.match(out, /import\("\.\/lazy\.ts"\)/);
  assert.match(out, /import "\.\/side\.ts"/);
  assert.match(out, /"pkg\/x\.js"/, 'package specifiers are untouched');
  assert.match(out, /"\.\/not-an-import\.js"/, 'plain strings are untouched');
  assert.equal(transformSource(source, 'x/y.ts'), source, 'off by default');
  assert.equal(transformSource(source, 'x/schema.sql', { tsImports: true }), source, 'only .ts and .tsx files');
});

test('a module installed with --ts-imports loads under Node type stripping, verifies and updates cleanly', async t => {
  const context = await loadCatalog(REPOSITORY_ROOT);
  const target = await app(t);
  const plain = await planInstall(context, 'webhook-verification', { target });
  assert.ok(plain.compatibility.warnings.some(warning => /--ts-imports/.test(warning)), 'an app without tsconfig.json is told about --ts-imports');

  const installed = await installModule(context, 'webhook-verification', { target, tsImports: true });
  assert.equal(installed.status, "installed");
  const providers = await fs.readFile(path.join(target, 'src/genlib/webhook-verification/providers.ts'), 'utf8');
  assert.match(providers, /from "\.\/hmac\.ts"/);
  assert.doesNotMatch(providers, /from "\.\/[^"]+\.js"/);
  const lock = JSON.parse(await fs.readFile(path.join(target, '.genlib/lock.json'), 'utf8'));
  assert.equal(lock.modules['webhook-verification'].tsImports, true);
  assert.equal(lock.files['src/genlib/webhook-verification/providers.ts'].sha256, sha(Buffer.from(providers)), 'the lock hashes the installed bytes');

  // Node runs the copied TypeScript directly (type stripping is on by default from Node 22.18 / 23.6).
  await fs.writeFile(path.join(target, 'check.ts'), [
    'import { verifyStripeWebhook } from "./src/genlib/webhook-verification/providers.ts";',
    'import { createHmac } from "node:crypto";',
    'const body = "{}", t = Math.floor(Date.now() / 1000);',
    'const sig = createHmac("sha256", "whsec_x").update(`${t}.${body}`).digest("hex");',
    'const result = await verifyStripeWebhook({ secret: "whsec_x", headers: { "stripe-signature": `t=${t},v1=${sig}` }, payload: body });',
    'console.log(JSON.stringify(result));',
  ].join('\n'));
  const out = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'check.ts'], { cwd: target, encoding: 'utf8' });
  assert.equal(JSON.parse(out).ok, true, out);

  const verified = await verifyInstallation(target);
  assert.ok(verified.files.filter(file => file.path.startsWith('src/genlib/')).every(file => file.status === 'unchanged'), JSON.stringify(verified.files));
  const update = await updateModule(context, target, 'webhook-verification', { original: () => null });
  assert.deepEqual(update.conflicts, []);
  assert.ok(update.files.filter(item => item.path.endsWith('.ts')).every(item => item.action === 'unchanged'), JSON.stringify(update.files));

  await assert.rejects(installModule(context, 'webhook-verification', { target, tsImports: false }), /--ts-imports/, 'a reinstall must keep the same setting');
  assert.equal((await planInstall(context, 'webhook-verification', { target })).tsImports, true, 'an omitted setting follows the recorded install');
});

test('without the option, --ts-imports is detected from scripts that run .ts files directly and reported', async t => {
  const context = await loadCatalog(REPOSITORY_ROOT);
  const stripping = await app(t);
  await fs.writeFile(path.join(stripping, 'package.json'), JSON.stringify({ name: 'app', type: 'module', scripts: { test: 'node --test "tests/**/*.test.ts"', start: 'node src/server.ts' } }));
  const detected = await planInstall(context, 'webhook-verification', { target: stripping });
  assert.equal(detected.tsImports, true);
  assert.equal(detected.tsImportsDetected, true);
  assert.ok(!detected.compatibility.warnings.some(warning => /--ts-imports/.test(warning)), 'no advice when it was applied');
  assert.match((await planInstall(context, 'email-signup', { target: stripping })).wiring ?? '', /genlib\/email-signup\/[\w-]+\.ts["']/, 'the wiring imports .ts paths');
  assert.ok(!(await planInstall(context, 'webhook-verification', { target: stripping, tsImports: false })).tsImports, 'an explicit false wins');

  const built = await app(t);
  await fs.writeFile(path.join(built, 'package.json'), JSON.stringify({ name: 'app', type: 'module', scripts: { test: 'node --test "tests/**/*.test.ts"' } }));
  await fs.writeFile(path.join(built, 'tsconfig.json'), '{}');
  assert.ok(!(await planInstall(context, 'webhook-verification', { target: built })).tsImports, 'a tsconfig.json means a build or a loader resolves .js');

  const javascript = await app(t);
  await fs.writeFile(path.join(javascript, 'package.json'), JSON.stringify({ name: 'app', type: 'module', scripts: { test: 'node --test', build: 'tsc -p . && echo src/x.ts' } }));
  const plain = await planInstall(context, 'webhook-verification', { target: javascript });
  assert.ok(!plain.tsImports, 'only a node, deno or bun command running a .ts path counts');
  assert.ok(plain.compatibility.warnings.some(warning => /--ts-imports/.test(warning)));
});
