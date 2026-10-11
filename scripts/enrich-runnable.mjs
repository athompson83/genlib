#!/usr/bin/env node
// Gives "Open: <url>"-only resource records a step an agent can run. For each such record with a GitHub
// repository it looks up candidate npm and PyPI package names and adds a package only when the registry's own
// metadata points back at the same repository (so a name collision is never added). Network; writes catalogs.
//   node scripts/enrich-runnable.mjs [--dry-run]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { quickstartFor } from '../lib/resources.mjs';

const dir = new URL('../resources/catalog/', import.meta.url);
const RUNNABLE = step => !/^(Open|Docs|Browse|See|Read|Check|Use|Pick|Or |License|Install with|Sign up)/i.test(step);
const norm = url => String(url ?? '').toLowerCase().replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/^ssh:\/\/git@github\.com/, 'https://github.com')
  .replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '').replace(/\/+$/, '').replace(/#.*$/, '').replace(/\/tree\/.*$/, '');
// A package whose latest release is over two years old is likely superseded (docker-compose on PyPI is Compose v1).
const STALE = Date.now() - 2 * 365 * 24 * 3600 * 1000;
const repoOf = item => [item.repository, item.homepage, item.docs].map(norm).find(url => /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(url));

async function npm(name, repo) {
  const r = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`); if (!r.ok) return null;
  const j = await r.json(); const latest = j['dist-tags']?.latest; const v = j.versions?.[latest];
  if (!v || v.deprecated || Date.parse(j.time?.[latest] ?? 0) < STALE) return null;
  const url = norm(typeof v.repository === 'string' ? v.repository : v.repository?.url);
  return url === repo || url.startsWith(repo + '/') ? { ecosystem: 'npm', name } : null;
}
async function pypi(name, repo) {
  const r = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`); if (!r.ok) return null;
  const body = await r.json(); const info = body.info ?? {};
  const uploaded = (body.urls ?? []).map(f => Date.parse(f.upload_time_iso_8601 ?? 0)).sort().pop() ?? 0;
  if (info.yanked || uploaded < STALE) return null;
  const urls = [info.home_page, info.project_url, ...Object.values(info.project_urls ?? {})].map(norm);
  return urls.some(url => url === repo || url.startsWith(repo + '/')) ? { ecosystem: 'pypi', name } : null;
}

const changes = [];
for (const name of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const url = new URL(name, dir), raw = readFileSync(url, 'utf8'), data = JSON.parse(raw);
  let changed = false;
  for (const item of data.items) {
    if (item.packages?.length || quickstartFor(item).some(RUNNABLE)) continue;
    const repo = repoOf(item); if (!repo) continue;
    const [owner, project] = repo.split('/').slice(-2);
    const names = [...new Set([item.id, project, item.name.toLowerCase().replace(/\s+/g, '-'), item.id.replace(/-(python|py|js|typescript|ts|node)$/, '')])]
      .filter(n => /^[a-z0-9@][a-z0-9._/-]*$/.test(n));
    const want = /python|pypi/.test(item.id) ? ['pypi'] : /typescript|-js$|node/.test(item.id) ? ['npm'] : ['pypi', 'npm'];
    const found = [];
    for (const n of names) for (const eco of want) {
      if (found.some(p => p.ecosystem === eco)) continue;
      const hit = await (eco === 'npm' ? npm(n, repo) : pypi(n, repo)).catch(() => null);
      if (hit) found.push(hit);
    }
    if (!found.length) continue;
    item.packages = found;
    // An authored quickstart that only links out is replaced by the derived install steps.
    if (item.quickstart && !item.quickstart.some(RUNNABLE)) delete item.quickstart;
    changes.push(`${item.id}: ${found.map(p => p.ecosystem + ':' + p.name).join(', ')} (${owner}/${project})`);
    changed = true;
  }
  if (changed && !process.argv.includes('--dry-run')) writeFileSync(url, JSON.stringify(data, null, raw.match(/^{\n( +)/)?.[1].length ?? 2) + '\n');
}
console.log(changes.join('\n')); console.log(`${changes.length} records gained a verified package`);
