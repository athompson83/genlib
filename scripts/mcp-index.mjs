#!/usr/bin/env node
// Maintains resources/mcp-servers.json install commands.
//   node scripts/mcp-index.mjs          give colliding local server names a namespaced name (offline)
//   node scripts/mcp-index.mjs --pin    also resolve "latest" npm versions and OCI tags to exact versions and digests (network)
//   node scripts/mcp-index.mjs --check  fail when a command launches "latest" or two records share a local name
// The highest-ranked record keeps the short name ("postgres"); later ones get "<name>-<owner>" from the registry name.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../resources/mcp-servers.json', import.meta.url);
const raw = readFileSync(file, 'utf8');
const data = JSON.parse(raw);
const servers = data.servers;
const NAME = { claude: /^(claude mcp add (?:--transport \S+ )?)(\S+)/, codex: /^(codex mcp add )(\S+)/ };
const nameOf = server => server.install.claude[0]?.match(NAME.claude)?.[2];
const LATEST = /(@latest\b|:latest\b)/;

export function collisions(list) {
  const seen = new Map();
  for (const server of list) { const name = nameOf(server); seen.set(name, [...(seen.get(name) ?? []), server]); }
  return [...seen].filter(([, group]) => group.length > 1);
}

function rename(server, name) {
  for (const client of ['claude', 'codex']) server.install[client] = server.install[client].map(step => step.replace(NAME[client], (_, head) => head + name));
}

function uniqueNames() {
  const taken = new Set(servers.map(nameOf));
  let renamed = 0;
  for (const [name, group] of collisions(servers)) {
    for (const server of [...group].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).slice(1)) {
      const owner = server.name.replace(/^[^/]*?([^./]+)\/.*$/, '$1').toLowerCase().replace(/[^a-z0-9-]/g, '-');
      let next = `${name}-${owner}`, n = 2;
      while (taken.has(next)) next = `${name}-${owner}-${n++}`;
      taken.add(next); rename(server, next); renamed++;
    }
  }
  return renamed;
}

async function json(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

// OCI images: keep the record's version tag when the registry has it, always add the digest.
async function ociDigest(image) {
  const match = image.match(/^(?:(ghcr\.io|docker\.io)\/)?([^:@]+):(.+)$/);
  if (!match) throw new Error('Unsupported image ' + image);
  const [, host = 'docker.io', repo, tag] = match;
  const name = host === 'docker.io' && !repo.includes('/') ? 'library/' + repo : repo;
  const token = host === 'ghcr.io'
    ? (await json(`https://ghcr.io/token?scope=repository:${name}:pull`)).token
    : (await json(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${name}:pull`)).token;
  const registry = host === 'ghcr.io' ? 'https://ghcr.io' : 'https://registry-1.docker.io';
  const accept = 'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.manifest.v1+json';
  const head = async ref => {
    const response = await fetch(`${registry}/v2/${name}/manifests/${ref}`, { method: 'HEAD', headers: { Authorization: `Bearer ${token}`, Accept: accept } });
    return response.ok ? response.headers.get('docker-content-digest') : null;
  };
  return { host, repo, tag, head };
}

async function pin() {
  let pinned = 0;
  const failures = [];
  for (const server of servers) {
    const steps = [...server.install.claude, ...server.install.codex];
    if (!steps.some(step => LATEST.test(step))) continue;
    try {
      const pkg = server.package;
      let from, to;
      if (pkg.registry === 'npm') {
        const version = (await json(`https://registry.npmjs.org/${pkg.identifier.replace('/', '%2f')}/latest`)).version;
        from = `${pkg.identifier}@latest`; to = `${pkg.identifier}@${version}`;
        pkg.version = version;
      } else if (pkg.registry === 'oci') {
        const { host, repo, tag, head } = await ociDigest(pkg.identifier);
        const versionTag = pkg.version && pkg.version !== 'latest' && await head(pkg.version) ? pkg.version : null;
        const digest = versionTag ? await head(versionTag) : await head(tag);
        if (!digest) throw new Error('no digest for ' + pkg.identifier);
        from = pkg.identifier;
        to = `${pkg.identifier.startsWith(host) ? host + '/' : ''}${repo}${versionTag ? ':' + versionTag : ''}@${digest}`;
        pkg.identifier = to;
      } else throw new Error('Unsupported registry ' + pkg.registry);
      for (const client of ['claude', 'codex']) server.install[client] = server.install[client].map(step => step.split(from).join(to));
      server.pinnedAt = new Date().toISOString().slice(0, 10);
      pinned++;
    } catch (error) { failures.push(`${server.id}: ${error.message}`); }
  }
  return { pinned, failures };
}

if (process.argv.includes('--check')) {
  const latest = servers.filter(server => [...server.install.claude, ...server.install.codex].some(step => LATEST.test(step))).map(server => server.id);
  const shared = collisions(servers).map(([name, group]) => `${name} (${group.length})`);
  if (latest.length || shared.length) {
    if (latest.length) console.error('Launches "latest": ' + latest.join(', '));
    if (shared.length) console.error('Shared local names: ' + shared.slice(0, 20).join(', ') + (shared.length > 20 ? ` (+${shared.length - 20} more)` : ''));
    console.error('Run node scripts/mcp-index.mjs --pin');
    process.exit(1);
  }
  console.log('MCP install commands pinned and uniquely named');
} else {
  const result = process.argv.includes('--pin') ? await pin() : { pinned: 0, failures: [] };
  const renamed = uniqueNames();
  writeFileSync(file, JSON.stringify(data, null, raw.match(/^{\n( +)/)?.[1].length ?? 1) + '\n');
  console.log(JSON.stringify({ pinned: result.pinned, renamed, failures: result.failures }, null, 2));
  if (result.failures.length) process.exitCode = 1;
}
