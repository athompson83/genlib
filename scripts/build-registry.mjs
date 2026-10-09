import * as fs from 'node:fs/promises';
import path from 'node:path';
import { buildArtifacts, REPOSITORY_ROOT } from '../lib/catalog.mjs';
import { checkedPath, ensureDirectory, invariant, optionalRegular, readRegular, rootDirectory } from '../lib/safety.mjs';

const check = process.argv.slice(2).includes('--check');
try {
  invariant(process.argv.slice(2).every(arg => arg === '--check'), 'INVALID_OPTION', 'Only --check is supported.');
  const root = await rootDirectory(REPOSITORY_ROOT);
  const artifacts = await buildArtifacts(root);
  const stale = [];
  for (const [relative, bytes] of artifacts) {
    const existing = await optionalRegular(root, relative, 2 * 1024 * 1024);
    if (!existing?.equals(bytes)) {
      if (check) stale.push(relative);
      else {
        await ensureDirectory(root, path.posix.dirname(relative));
        await fs.writeFile(await checkedPath(root, relative, true), bytes);
      }
    }
  }
  const manifestDirectory = await checkedPath(root, 'registry/manifests', true);
  const entries = await fs.readdir(manifestDirectory).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) {
    const relative = 'registry/manifests/' + entry;
    if (!artifacts.has(relative)) {
      await readRegular(root, relative);
      if (check) stale.push(relative);
      else await fs.unlink(path.join(root, relative));
    }
  }
  invariant(stale.length === 0, 'STALE_REGISTRY', 'Generated registry is stale: ' + stale.join(', ') + '. Run npm run registry:build.');
  console.log(JSON.stringify({ status: check ? 'current' : 'built', modules: artifacts.size - 1 }));
} catch (error) {
  console.error(JSON.stringify({ error: error.message, code: error.code || 'ERROR' }));
  process.exitCode = 1;
}
