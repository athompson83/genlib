import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createElement } from 'react';
import { loadCatalog, REPOSITORY_ROOT } from '../lib/catalog.mjs';
import { installModule, planInstall, verifyInstallation } from '../lib/install.mjs';
import { render, click, type } from './web-dom.mjs';

async function app(t) {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'genlib-component-handoff-'));
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({
    name: 'component-handoff-fixture', private: true, type: 'commonjs', dependencies: { react: '^19.0.0' },
  }));
  await fs.writeFile(path.join(target, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'react-jsx',
      strict: true, skipLibCheck: true, outDir: '.built', noUncheckedSideEffectImports: true,
    },
    include: ['Handoff.tsx', 'styles.d.ts', 'src/**/*.tsx', 'lib/**/*.tsx'],
  }));
  return target;
}

test('data-table plan and add return the same complete handoff without claiming app acceptance', async t => {
  const target = await app(t);
  const context = await loadCatalog();
  const plan = await planInstall(context, 'data-table', { target });
  assert.equal(plan.writes, false);
  assert.deepEqual((await fs.readdir(target)).sort(), ['package.json', 'tsconfig.json']);
  assert.match(plan.wiring, /^"use client";/);
  assert.match(plan.wiring, /from "\.\/src\/genlib\/data-table\/DataTable\.js";/);
  assert.match(plan.wiring, /^import "\.\/src\/genlib\/theme-tokens\/theme\.css";$/m);
  assert.match(plan.wiring, /^import "\.\/src\/genlib\/data-table\/data-table\.css";$/m);
  assert.match(plan.wiring, /export function ProjectsTable/);
  assert.match(plan.wiring, /genlib verify checks copied-file hashes, not rendering or application behavior/);
  assert.ok(plan.wiring.split('\n').length <= 40);
  assert.doesNotMatch(plan.wiring, /truncated/);

  const added = await installModule(context, 'data-table', { target });
  assert.equal(added.wiring, plan.wiring);
  assert.equal(added.status, 'installed');
  const verified = await verifyInstallation(target);
  assert.equal(verified.status, 'unchanged');
  assert.match(verified.note, /Run the consuming application tests separately/);

  // Execute the actual command embedded in quick's handoff, using argv rather than a shell.
  // verify deliberately accepts no module ID; a previously emitted ID made this step unusable.
  const cli = path.join(REPOSITORY_ROOT, 'bin/genlib.mjs');
  const quick = spawnSync(process.execPath, [cli, 'quick', 'searchable', 'table', '--target', target, '--json'], { encoding: 'utf8' });
  assert.equal(quick.status, 0, quick.stderr);
  const picked = JSON.parse(quick.stdout);
  assert.equal(picked.best, 'module:data-table');
  const command = picked.verify.match(/\bgenlib (.+?) checks copied hashes only$/)?.[1];
  assert.ok(command, 'the hash check is identified separately from application checks');
  const args = command.match(/"[^"]*"|\S+/g).map(arg => arg.replace(/^"|"$/g, '').replace('$APP_ROOT', target));
  const checked = spawnSync(process.execPath, [cli, ...args, '--json'], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).status, 'unchanged');

  const direct = await planInstall(context, 'data-table', { target: await app(t), out: 'lib/widgets', tsImports: true });
  assert.match(direct.wiring, /from "\.\/lib\/widgets\/data-table\/DataTable\.tsx";/);
  assert.match(direct.wiring, /^import "\.\/lib\/widgets\/theme-tokens\/theme\.css";$/m);
  assert.match(direct.wiring, /^import "\.\/lib\/widgets\/data-table\/data-table\.css";$/m);
});

test('the returned data-table handoff typechecks and works with installed files in a React DOM fixture', async t => {
  const target = await app(t);
  const added = await installModule(await loadCatalog(), 'data-table', { target, out: 'lib/widgets' });
  await fs.writeFile(path.join(target, 'Handoff.tsx'), added.wiring + '\n');
  await fs.writeFile(path.join(target, 'styles.d.ts'), 'declare module "*.css";\n');
  // Use the repository's existing devDependencies; this fixture never runs a package manager.
  await fs.symlink(path.join(REPOSITORY_ROOT, 'node_modules'), path.join(target, 'node_modules'), 'dir');
  const build = spawnSync(process.execPath, [path.join(REPOSITORY_ROOT, 'node_modules/typescript/bin/tsc'), '-p', target], {
    encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(build.status, 0, build.stderr + build.stdout);

  const cssImports = [...added.wiring.matchAll(/^import "([^"]+\.css)";/gm)].map(match => match[1]);
  assert.equal(cssImports.length, 2);
  for (const relative of cssImports) {
    const bytes = await fs.readFile(path.join(target, relative));
    assert.ok(bytes.length > 0, 'every returned stylesheet import resolves to installed source');
    const compiledPath = path.join(target, '.built', relative);
    await fs.mkdir(path.dirname(compiledPath), { recursive: true });
    await fs.writeFile(compiledPath, bytes);
  }
  const require = createRequire(path.join(target, '.built/Handoff.js'));
  const previous = require.extensions['.css'];
  let ProjectsTable;
  try {
    // Node has no stylesheet loader. Check file paths above, then omit CSS execution for this DOM behavior test.
    require.extensions['.css'] = module => { module.exports = {}; };
    ({ ProjectsTable } = require('./Handoff.js'));
  } finally {
    if (previous) require.extensions['.css'] = previous;
    else delete require.extensions['.css'];
  }
  const projects = Array.from({ length: 12 }, (_, index) => ({ id: String(index), name: `Project ${index}`, openTasks: index }));
  const view = await render(createElement(ProjectsTable, { projects }));
  t.after(view.cleanup);
  const cells = () => [...view.container.querySelectorAll('tbody tr')].map(row => row.querySelector('td').textContent);
  const button = text => [...view.container.querySelectorAll('button')].find(node => node.textContent === text);
  assert.equal(view.container.querySelector('caption').textContent, 'Projects');
  assert.equal(cells().length, 10);
  await click(button('Next'));
  assert.deepEqual(cells(), ['Project 10', 'Project 11']);
  await click(view.container.querySelector('button[aria-label="Sort Open tasks ascending"]'));
  assert.equal(cells()[0], 'Project 0');
  await click(view.container.querySelector('button[aria-label="Sort Open tasks descending"]'));
  assert.equal(cells()[0], 'Project 11');
  await type(view.container.querySelector('input[type="search"]'), 'Project 11');
  assert.deepEqual(cells(), ['Project 11']);
  await type(view.container.querySelector('input[type="search"]'), 'no match');
  assert.deepEqual(cells(), ['No matching records.']);
  await view.rerender(createElement(ProjectsTable, { projects: [] }));
  assert.deepEqual(cells(), ['No records yet.']);
});
