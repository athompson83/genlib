#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildIntegrationArtifacts } from '../lib/integrations.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node scripts/build-integrations.mjs [--check]');
const changed = [];
for (const [file, bytes] of await buildIntegrationArtifacts(root)) {
  const current = await fs.readFile(path.join(root, file)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!current?.equals(bytes)) {
    changed.push(file);
    if (!check) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), bytes); }
  }
}
process.stdout.write(JSON.stringify({ mode: check ? 'check' : 'build', changed }) + '\n');
if (check && changed.length) process.exitCode = 1;
