#!/usr/bin/env node
import { syncSkillMirrors } from './install-skills.mjs';

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check') || args.length > 1) throw new Error('Usage: node scripts/sync-skills.mjs [--check]');
  const check = args.includes('--check');
  const result = syncSkillMirrors({ check });
  process.stdout.write(`${JSON.stringify({ mode: check ? 'check' : 'sync', ...result }, null, 2)}\n`);
  if (check && !result.matches) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`genlib skills: ${error.message}\n`);
  process.exitCode = 1;
}
