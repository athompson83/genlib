// SPDX-License-Identifier: Apache-2.0
// Three-way text merge with git merge-file: ours (the app's edited copy), base (what was installed) and theirs
// (the new upstream version). Returns the merged bytes and the number of conflicts (0 when clean).
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { invariant } from './safety.mjs';

export async function mergeThreeWay(ours, base, theirs, labels = ['your edits', 'installed version', 'new Genlib version']) {
  const dir = path.join(process.env.TMPDIR ?? '/tmp', 'genlib-merge-' + randomUUID());
  await fs.mkdir(dir, { mode: 0o700 });
  try {
    await Promise.all([fs.writeFile(path.join(dir, 'ours'), ours), fs.writeFile(path.join(dir, 'base'), base), fs.writeFile(path.join(dir, 'theirs'), theirs)]);
    const run = spawnSync('git', ['merge-file', '-p', '-L', labels[0], '-L', labels[1], '-L', labels[2], 'ours', 'base', 'theirs'], { cwd: dir, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 });
    invariant(run.status !== null && run.status >= 0 && run.status < 128, 'MERGE_FAILED', 'git merge-file failed: ' + (run.stderr?.toString() ?? ''));
    return { merged: run.stdout, conflicts: run.status };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
