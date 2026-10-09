import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const canonical = path.join(root, 'skills', 'genlib-use');
const installer = path.join(root, 'scripts', 'install-skills.mjs');
const symlinkUnsupported = process.platform === 'win32' ? 'Symlink creation can require elevated Windows permissions.' : false;

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'genlib-skills-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function run(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: root });
}

function install(target, harness = 'both', script = installer) {
  return run(script, ['--target', target, '--harness', harness]);
}

function contents(directory) {
  const result = {};
  function walk(current, relative = '') {
    for (const name of fs.readdirSync(current).sort()) {
      const key = relative ? `${relative}/${name}` : name;
      const filename = path.join(current, name);
      if (fs.statSync(filename).isDirectory()) walk(filename, key);
      else result[key] = fs.readFileSync(filename, 'utf8');
    }
  }
  walk(directory);
  return result;
}

function fixture(t) {
  const directory = temporary(t);
  fs.mkdirSync(path.join(directory, 'scripts'));
  for (const name of ['install-skills.mjs', 'sync-skills.mjs']) {
    fs.copyFileSync(path.join(root, 'scripts', name), path.join(directory, 'scripts', name));
  }
  fs.cpSync(canonical, path.join(directory, 'skills', 'genlib-use'), { recursive: true });
  return directory;
}

function mirror(directory, harness) {
  return path.join(directory, harness === 'codex' ? '.agents' : '.claude', 'skills', 'genlib-use');
}

test('portable skill instructions and display prompt contain valid JSON', () => {
  const files = contents(canonical);
  for (const name of ['SKILL.md', 'references/bootstrap.md', 'references/cli.md']) {
    const blocks = [...files[name].matchAll(/```json\n([\s\S]*?)\n```/g)];
    assert.ok(blocks.length > 0, `JSON instructions exist in ${name}`);
    for (const block of blocks) assert.doesNotThrow(() => JSON.parse(block[1]), name);
  }
  const yamlValue = files['agents/openai.yaml'].match(/default_prompt: (.+)/)[1];
  const prompt = JSON.parse(JSON.parse(yamlValue));
  assert.match(prompt.task, /\$genlib-use/);
  for (const relative of ['references/bootstrap.md', 'references/cli.md']) {
    assert.ok(Object.hasOwn(files, relative), `${relative} travels with the skill`);
  }
});

test('installs the complete skill for both harnesses and preserves project instructions', (t) => {
  const target = temporary(t);
  for (const name of ['AGENTS.md', 'CLAUDE.md']) fs.writeFileSync(path.join(target, name), `Keep ${name}`);
  const unrelated = path.join(target, '.claude', 'skills', 'project-skill');
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(unrelated, 'SKILL.md'), 'Private instructions');
  const result = install(target);
  assert.equal(result.status, 0, result.stderr);
  const expected = contents(canonical);
  assert.deepEqual(contents(mirror(target, 'codex')), expected);
  assert.deepEqual(contents(mirror(target, 'claude')), expected);
  for (const name of ['AGENTS.md', 'CLAUDE.md']) assert.equal(fs.readFileSync(path.join(target, name), 'utf8'), `Keep ${name}`);
  assert.equal(fs.readFileSync(path.join(unrelated, 'SKILL.md'), 'utf8'), 'Private instructions');
  assert.equal(JSON.parse(result.stdout).filesWritten, Object.keys(expected).length * 2);
});

test('individual harness selection writes only the selected directory', (t) => {
  for (const harness of ['codex', 'claude']) {
    const target = temporary(t);
    const result = install(target, harness);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(contents(mirror(target, harness)), contents(canonical));
    assert.equal(fs.existsSync(mirror(target, harness === 'codex' ? 'claude' : 'codex')), false);
  }
});

test('identical installation is idempotent without changing file timestamps', (t) => {
  const target = temporary(t);
  assert.equal(install(target).status, 0);
  const filename = path.join(mirror(target, 'codex'), 'SKILL.md');
  const before = fs.statSync(filename, { bigint: true }).mtimeNs;
  const result = install(target);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).filesWritten, 0);
  assert.equal(fs.statSync(filename, { bigint: true }).mtimeNs, before);
});

test('preflights every harness before writing and preserves a modified skill', (t) => {
  const target = temporary(t);
  assert.equal(install(target, 'claude').status, 0);
  const filename = path.join(mirror(target, 'claude'), 'references', 'cli.md');
  fs.writeFileSync(filename, 'Customer-specific instructions');
  const before = contents(target);
  const result = install(target);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing modified skill file/);
  assert.deepEqual(contents(target), before);
  assert.equal(fs.existsSync(path.join(target, '.agents')), false);
});

test('refuses unexpected customer files instead of deleting or merging them', (t) => {
  const target = temporary(t);
  assert.equal(install(target, 'codex').status, 0);
  const filename = path.join(mirror(target, 'codex'), 'customer.md');
  fs.writeFileSync(filename, 'Keep this material');
  const result = install(target);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing unexpected skill file/);
  assert.equal(fs.readFileSync(filename, 'utf8'), 'Keep this material');
  assert.equal(fs.existsSync(path.join(target, '.claude')), false);
});

test('rejects relative, missing, and traversing targets without creating directories', (t) => {
  const base = temporary(t);
  const missing = path.join(base, 'missing');
  for (const target of ['relative-project', missing, `${base}/child/../project`]) {
    const result = install(target);
    assert.equal(result.status, 1, target);
  }
  assert.deepEqual(fs.readdirSync(base), []);
});

test('rejects invalid, missing, and duplicate command options', (t) => {
  const target = temporary(t);
  const cases = [[], ['--target'], ['--target', target, '--harness', 'other'], ['--target', target, '--force'], ['--target', target, '--target', target]];
  for (const args of cases) assert.equal(run(installer, args).status, 1, JSON.stringify(args));
  assert.deepEqual(fs.readdirSync(target), []);
});

test('rejects symlinked target roots and ancestors', { skip: symlinkUnsupported }, (t) => {
  const base = temporary(t);
  const outside = path.join(base, 'outside');
  fs.mkdirSync(outside);
  const link = path.join(base, 'link');
  fs.symlinkSync(outside, link, 'dir');
  fs.mkdirSync(path.join(outside, 'project'));
  for (const target of [link, path.join(link, 'project')]) {
    const result = install(target);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing symlink/);
  }
  assert.deepEqual(fs.readdirSync(outside), ['project']);
  assert.deepEqual(fs.readdirSync(path.join(outside, 'project')), []);
});

test('rejects symlinks at every harness destination depth', { skip: symlinkUnsupported }, (t) => {
  for (const relative of ['.agents', '.agents/skills', '.agents/skills/genlib-use', '.agents/skills/genlib-use/references']) {
    const base = temporary(t);
    const target = path.join(base, 'project');
    const outside = path.join(base, 'outside');
    fs.mkdirSync(target);
    fs.mkdirSync(outside);
    const linked = path.join(target, relative);
    fs.mkdirSync(path.dirname(linked), { recursive: true });
    fs.symlinkSync(outside, linked, 'dir');
    const result = install(target);
    assert.equal(result.status, 1, relative);
    assert.match(result.stderr, /Refusing symlink/);
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.equal(fs.existsSync(path.join(target, '.claude')), false);
  }
});

test('rejects symlinked and hardlinked destination files', { skip: symlinkUnsupported }, (t) => {
  for (const linkType of ['symbolic', 'hard']) {
    const base = temporary(t);
    const target = path.join(base, 'project');
    fs.mkdirSync(target);
    const destination = mirror(target, 'codex');
    fs.mkdirSync(destination, { recursive: true });
    const outside = path.join(base, 'private.md');
    fs.writeFileSync(outside, 'Preserve the private file');
    if (linkType === 'symbolic') fs.symlinkSync(outside, path.join(destination, 'SKILL.md'));
    else fs.linkSync(outside, path.join(destination, 'SKILL.md'));
    const result = install(target);
    assert.equal(result.status, 1);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'Preserve the private file');
    assert.equal(fs.existsSync(path.join(target, '.claude')), false);
  }
});

test('rejects symlinked canonical sources before copying any file', { skip: symlinkUnsupported }, (t) => {
  for (const relative of ['', 'SKILL.md', 'references']) {
    const copy = fixture(t);
    const target = path.join(copy, 'project');
    fs.mkdirSync(target);
    const source = path.join(copy, 'skills', 'genlib-use', relative);
    const outside = path.join(copy, 'outside');
    fs.renameSync(source, outside);
    fs.symlinkSync(outside, source, relative === 'SKILL.md' ? 'file' : 'dir');
    const result = install(target, 'both', path.join(copy, 'scripts', 'install-skills.mjs'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing symlink/);
    assert.deepEqual(fs.readdirSync(target), []);
  }
});

test('rejects portable-path violations in canonical source filenames', (t) => {
  const copy = fixture(t);
  fs.writeFileSync(path.join(copy, 'skills', 'genlib-use', '.unexpected.md'), 'Do not copy');
  const target = path.join(copy, 'project');
  fs.mkdirSync(target);
  const result = install(target, 'both', path.join(copy, 'scripts', 'install-skills.mjs'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsafe skill entry name/);
  assert.deepEqual(fs.readdirSync(target), []);
});

test('mirror check is read-only and sync updates known generated files', (t) => {
  const copy = fixture(t);
  const sync = path.join(copy, 'scripts', 'sync-skills.mjs');
  assert.equal(run(sync, ['--check']).status, 1);
  assert.equal(fs.existsSync(path.join(copy, '.agents')), false);
  assert.equal(run(sync).status, 0);
  assert.equal(run(sync, ['--check']).status, 0);
  const changed = path.join(copy, 'skills', 'genlib-use', 'SKILL.md');
  fs.appendFileSync(changed, '\nA revised workflow.\n');
  const oldMirror = fs.readFileSync(path.join(mirror(copy, 'codex'), 'SKILL.md'), 'utf8');
  assert.equal(run(sync, ['--check']).status, 1);
  assert.equal(fs.readFileSync(path.join(mirror(copy, 'codex'), 'SKILL.md'), 'utf8'), oldMirror);
  assert.equal(run(sync).status, 0);
  assert.deepEqual(contents(mirror(copy, 'codex')), contents(path.join(copy, 'skills', 'genlib-use')));
  assert.equal(run(sync, ['--check']).status, 0);
});

test('mirror sync preserves unexpected content and refuses the operation', (t) => {
  const copy = fixture(t);
  const sync = path.join(copy, 'scripts', 'sync-skills.mjs');
  assert.equal(run(sync).status, 0);
  const extra = path.join(mirror(copy, 'claude'), 'unexpected.md');
  fs.writeFileSync(extra, 'Keep local work');
  fs.appendFileSync(path.join(copy, 'skills', 'genlib-use', 'SKILL.md'), '\nChanged source.\n');
  const before = contents(mirror(copy, 'codex'));
  assert.equal(run(sync).status, 1);
  assert.equal(fs.readFileSync(extra, 'utf8'), 'Keep local work');
  assert.deepEqual(contents(mirror(copy, 'codex')), before);
});
