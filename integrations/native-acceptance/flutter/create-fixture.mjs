// SPDX-License-Identifier: Apache-2.0
import { mkdir, cp, access, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Deliberate scaffold command. A new destination is required; no receiving app is edited.
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node create-fixture.mjs NEW_DIRECTORY');
const target = resolve(destination);
try { await access(target); throw new Error('Destination already exists'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const check = spawnSync('flutter', ['--version'], { stdio: 'inherit' });
if (check.error || check.status !== 0) throw new Error('A working Flutter installation is required');
await mkdir(dirname(target), { recursive: true });
const created = spawnSync('flutter', ['create', '--no-pub', '--platforms=android,ios', '--org=dev.genlib', '--project-name=genlib_inventory', target], { stdio: 'inherit' });
if (created.error || created.status !== 0) throw new Error('Flutter scaffold failed; inspect the new directory before retrying');
const source = dirname(fileURLToPath(import.meta.url));
for (const file of ['pubspec.yaml', 'lib/main.dart', 'test/inventory_test.dart', 'patrol_test/inventory_test.dart'])
  {
    await mkdir(dirname(resolve(target, file)), { recursive: true });
    await cp(resolve(source, file), resolve(target, file), { recursive: false, force: true });
  }
await rm(resolve(target, 'test/widget_test.dart'), { force: true });
console.log(`Fixture created: ${target}. Run flutter pub get, then flutter test test/inventory_test.dart. Merge native/ profiles before Patrol device tests.`);
