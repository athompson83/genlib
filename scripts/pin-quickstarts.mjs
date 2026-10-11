#!/usr/bin/env node
// Pins executable "latest" references in resource quickstarts so an agent runs what was reviewed:
//   npm packages run with @latest (npx shadcn@latest add ...) -> the exact current version;
//   container images pulled or run at :latest -> the image digest (image@sha256:...).
// Documentation URLs that contain "latest" are left alone.
//   node scripts/pin-quickstarts.mjs          resolve and rewrite (network)
//   node scripts/pin-quickstarts.mjs --check  fail when a quickstart still runs "latest"
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../resources/catalog/', import.meta.url);
const NPM = /(^|[\s`(])((?:@[\w.-]+\/)?[\w.-]+)@latest(?=[\s`)"]|$)/g;
// Moving image tags: latest and latest-<variant> (latest-cpu, latest-pg17, latest-alpine).
const IMAGE = /(^|[\s`(])((?:[\w.-]+\.[a-z]{2,}\/)?[\w.-]+(?:\/[\w.-]+)*):(latest(?:-[\w.]+)?)(?=[\s`)"]|$)/g;
// go install/get/run <module path>@latest.
const GO = /(go (?:install|get|run) )(\S+?)@latest(?=[\s`)"]|$)/g;
const runs = step => !/^(Docs|Browse|See|Read)\b/i.test(step);
const latestSteps = step => runs(step) && [NPM, IMAGE, GO].some(re => new RegExp(re.source).test(step));

const cache = new Map();
async function npmVersion(name) {
  if (!cache.has(name)) cache.set(name, fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}/latest`).then(r => { if (!r.ok) throw new Error(`${r.status} npm ${name}`); return r.json(); }).then(j => j.version));
  return cache.get(name);
}
async function imageDigest(image, tag = 'latest') {
  const key = image + ':' + tag;
  if (cache.has(key)) return cache.get(key);
  const quay = image.startsWith('quay.io/');
  const ghcr = image.startsWith('ghcr.io/') || quay;
  const name = quay ? image.slice(8) : ghcr ? image.slice(8) : image.replace(/^docker\.io\//, '').includes('/') ? image.replace(/^docker\.io\//, '') : 'library/' + image.replace(/^docker\.io\//, '');
  const tokenUrl = quay ? `https://quay.io/v2/auth?service=quay.io&scope=repository:${name}:pull` : ghcr ? `https://ghcr.io/token?scope=repository:${name}:pull` : `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${name}:pull`;
  const promise = (async () => {
    const { token } = await (await fetch(tokenUrl)).json();
    const response = await fetch(`${quay ? 'https://quay.io' : ghcr ? 'https://ghcr.io' : 'https://registry-1.docker.io'}/v2/${name}/manifests/${tag}`, { method: 'HEAD', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.manifest.v1+json' } });
    const digest = response.ok && response.headers.get('docker-content-digest');
    if (!digest) throw new Error(`${response.status} image ${image}`);
    return digest;
  })();
  cache.set(key, promise);
  return promise;
}
// The module that owns a Go package path, and its current version, from the Go module proxy.
async function goVersion(path) {
  const parts = path.split('/');
  for (let n = parts.length; n >= 3; n--) {
    const module = parts.slice(0, n).join('/');
    const escaped = module.replace(/[A-Z]/g, c => '!' + c.toLowerCase());
    const response = await fetch(`https://proxy.golang.org/${escaped}/@latest`);
    if (response.ok) return (await response.json()).Version;
  }
  throw new Error('no Go module for ' + path);
}

async function replaceAsync(text, pattern, fn) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) { parts.push(text.slice(last, match.index), await fn(...match, match.index, text)); last = match.index + match[0].length; }
  return parts.join('') + text.slice(last);
}

const check = process.argv.includes('--check');
const stale = [], failures = [];
let pinned = 0;
const top = new URL('../resources/', import.meta.url);
const files = [...readdirSync(dir).filter(file => file.endsWith('.json')).map(name => new URL(name, dir)), ...readdirSync(top).filter(file => file.endsWith('.json')).map(name => new URL(name, top))];
for (const url of files) {
  const name = url.pathname.split('/').slice(-2).join('/');
  const raw = readFileSync(url, 'utf8');
  const data = JSON.parse(raw);
  const items = data.items ?? data.resources ?? [];
  // Edit the steps in place in the raw text so the rest of the file keeps its formatting and escapes.
  let text = raw, rewrite = false, changed = false;
  for (const item of items) {
    if (!Array.isArray(item.quickstart)) continue;
    for (const [index, step] of item.quickstart.entries()) {
      if (!latestSteps(step)) continue;
      if (check) { stale.push(`${name}: ${item.id}`); continue; }
      try {
        // "npm create vite@latest" runs the package create-vite (and @scope/x runs @scope/create-x).
        const creates = /\b(?:npm|pnpm|yarn|bun) (?:create|init)\s*$/;
        let next = await replaceAsync(step, NPM, async (_, lead, pkg, offset, whole) => {
          const runner = creates.test(whole.slice(0, offset + lead.length)) ? (pkg.startsWith('@') ? pkg.replace(/\/(.*)$/, '/create-$1') : 'create-' + pkg) : pkg;
          return `${lead}${pkg}@${await npmVersion(runner)}`;
        });
        next = await replaceAsync(next, IMAGE, async (_, lead, image, tag) => tag === 'latest' ? `${lead}${image}@${await imageDigest(image)}` : `${lead}${image}:${tag}@${await imageDigest(image, tag)}`);
        next = await replaceAsync(next, GO, async (_, lead, path) => `${lead}${path}@${await goVersion(path)}`);
        const before = JSON.stringify(step);
        if (text.includes(before)) text = text.replace(before, () => JSON.stringify(next)); else rewrite = true;
        item.quickstart[index] = next; changed = true; pinned++;
      } catch (error) { failures.push(`${item.id}: ${error.message}`); }
    }
  }
  if (changed) writeFileSync(url, rewrite ? JSON.stringify(data, null, raw.match(/^{\n( +)/)?.[1].length ?? 2) + '\n' : text);
}
if (check) {
  if (stale.length) { console.error(`${stale.length} quickstarts run "latest": ${stale.slice(0, 10).join(', ')}. Run node scripts/pin-quickstarts.mjs`); process.exit(1); }
  console.log('quickstarts pinned');
} else {
  console.log(JSON.stringify({ pinned, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}
