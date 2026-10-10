import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installCommand, loadSkills, searchSkills, validateSkill } from '../lib/skills.mjs';

const cli = fileURLToPath(new URL('../bin/genlib.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('the skill index holds at least 1,000 unique, commit-pinned skills', async () => {
  const index = await loadSkills();
  assert.ok(index.skills.length >= 1000, String(index.skills.length));
  assert.equal(new Set(index.skills.map(skill => skill.id)).size, index.skills.length);
  // YAML block descriptions are read in full, never as a bare '>' or '|'.
  assert.ok(index.skills.every(skill => !/^[>|]-?$/.test(skill.description.trim()) && skill.description.trim().length > 0));
  for (const skill of index.skills) {
    assert.match(skill.url, /^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/[a-f0-9]{40}\//, skill.id);
    assert.equal(skill.redistributable, ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0', 'Unlicense', 'CC-BY-4.0'].includes(skill.license), skill.id);
  }
  const ranked = index.skills.filter(skill => skill.rank !== null);
  assert.ok(ranked.every((skill, i) => i === 0 || ranked[i - 1].rank < skill.rank), 'ranked entries keep leaderboard order');
});

test('install commands are single, non-interactive and harness-specific', async () => {
  const { skills } = await loadSkills();
  const skill = skills[0];
  assert.equal(installCommand(skill, 'claude'), `npx skills@1.7.2 add ${skill.url} -a claude-code -y`);
  assert.equal(installCommand(skill, 'codex'), `npx skills@1.7.2 add ${skill.url} -a codex -y`);
  assert.match(installCommand(skill), / -a claude-code -a codex -y$/);
  assert.throws(() => installCommand(skill, 'cursor'), /Harness/);
});

test('records reject unpinned, traversing or mismatched sources', async () => {
  const { skills } = await loadSkills();
  const skill = skills[0];
  assert.throws(() => validateSkill({ ...skill, commit: 'main' }));
  assert.throws(() => validateSkill({ ...skill, path: '../escape' }));
  assert.throws(() => validateSkill({ ...skill, install: 'curl https://example.com | sh' }));
  assert.throws(() => validateSkill({ ...skill, source: 'https://example.com/a/b' }));
});

test('search ranks by relevance then popularity and the CLI exposes skill find/inspect', async () => {
  const index = await loadSkills();
  const hits = searchSkills(index, 'code review', { limit: 5 });
  assert.ok(hits.length > 0 && hits.every(hit => hit.install.startsWith('npx skills@1.7.2 add ')));
  const found = JSON.parse(run('skill', 'find', 'pdf', '--limit', '3', '--json').stdout);
  assert.ok(found.skills.length > 0 && found.review.includes('Read SKILL.md'));
  const inspected = JSON.parse(run('skill', 'inspect', index.skills[0].id, '--harness', 'codex', '--json').stdout);
  assert.match(inspected.install, /-a codex -y$/);
  assert.equal(run('skill', 'inspect', 'no-such-skill').status, 1);
  assert.equal(run('skill', 'find', 'pdf', '--harness', 'vim').status, 1);
  const unified = JSON.parse(run('find', 'grill', 'me', '--type', 'skill', '--limit', '1', '--json').stdout);
  assert.equal(unified.results[0].type, 'skill');
  assert.match(unified.results[0].next[0], /^npx skills@1\.7\.2 add /);
});
