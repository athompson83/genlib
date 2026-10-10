// The cheapest pinned way into an external project's original source. Genlib indexes far more
// projects than it vendors; for any record with a repository, `genlib source` prints commands that
// fetch only what the agent needs (a shallow, blob-less, sparse checkout of one path, or one raw
// file) plus the license note and, where one exists, the Genlib code that already does the job.
// It prints commands and never runs them.
import { invariant, parseJson, readRegular } from './safety.mjs';

const SOURCE_KINDS = ['resource', 'skill', 'starter', 'task', 'mcp', 'cli', 'api'];
const quote = value => /^[\w@%+=:,./-]+$/.test(value) ? value : "'" + String(value).replaceAll("'", "'\\''") + "'";

// Splits https://github.com/o/r/tree/<ref>/<path> (or /blob/) into the clone URL, ref and path.
export function parseRepository(url) {
  invariant(typeof url === 'string' && /^https:\/\/[^\s]+$/.test(url), 'INVALID_OPTION', 'Repository must be an https URL.');
  const github = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/(.+))?)?\/?$/.exec(url);
  if (github) return { host: 'github', owner: github[1], repo: github[2], clone: `https://github.com/${github[1]}/${github[2]}`, ref: github[3], path: github[4] };
  const gitlab = /^https:\/\/(gitlab\.com|codeberg\.org)\/(.+?)(?:\/-\/(?:tree|blob)\/([^/]+)(?:\/(.+))?)?\/?$/.exec(url);
  if (gitlab) return { host: gitlab[1], clone: `https://${gitlab[1]}/${gitlab[2]}`, ref: gitlab[3], path: gitlab[4] };
  return { host: 'other', clone: url.replace(/\/$/, '') };
}

export function sourceCommands({ repository, commit, path: wanted, directory }) {
  const parsed = parseRepository(repository);
  const path = (wanted ?? parsed.path ?? '').replace(/^\/+|\/+$/g, '');
  invariant(!path.split('/').includes('..'), 'INVALID_OPTION', 'Path must stay inside the repository.');
  const pin = commit ?? (parsed.ref && /^[0-9a-f]{40}$/.test(parsed.ref) ? parsed.ref : undefined);
  const dir = directory ?? (parsed.repo ?? parsed.clone.split('/').pop() ?? 'source').replace(/[^\w.-]/g, '-');
  const steps = [];
  if (pin) {
    // Pinned: fetch exactly one commit without file contents, then materialise only the path.
    steps.push(`git init -q ${dir} && git -C ${dir} remote add origin ${parsed.clone} && git -C ${dir} fetch -q --depth 1 --filter=blob:none origin ${pin}`);
    if (path) steps.push(`git -C ${dir} sparse-checkout set --no-cone ${quote('/' + path + '/')} ${quote('/' + path)}`);
    steps.push(`git -C ${dir} checkout -q FETCH_HEAD`);
  } else {
    steps.push(`git ls-remote ${parsed.clone} HEAD   # record this commit before reusing anything`);
    steps.push(`git clone -q --depth 1 --filter=blob:none ${path ? '--sparse ' : ''}${parsed.clone} ${dir}${parsed.ref ? ' --branch ' + parsed.ref : ''}`);
    if (path) steps.push(`git -C ${dir} sparse-checkout set ${quote(path)}`);
  }
  const ref = pin ?? parsed.ref ?? 'HEAD';
  const raw = parsed.host === 'github' ? `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${ref}/${path ? path + '/' : ''}<file>` : undefined;
  const browse = parsed.host === 'github' ? `https://github.com/${parsed.owner}/${parsed.repo}/tree/${ref}${path ? '/' + path : ''}` : parsed.clone;
  return { repository: parsed.clone, ...(pin ? { commit: pin } : { commit: null }), ...(path ? { path } : {}), fetch: steps, ...(raw ? { raw } : {}), browse };
}

function recordsOf(sources, kind) {
  return { resource: sources.resources, skill: sources.skills, starter: sources.starter, task: sources.task, mcp: sources.mcp, cli: sources.cli, api: sources.api }[kind] ?? [];
}

// Resolves `type:id` or a bare id across every external index and returns the access plan.
export async function sourcePlan(sources, ref, { path } = {}) {
  invariant(typeof ref === 'string' && /^(?:[a-z-]+:)?[a-z0-9][\w.@-]{0,159}$/i.test(ref) && !ref.includes('..'), 'INVALID_OPTION', 'Provide one reference such as resource:pocketbase or starter:create-t3-app.');
  const [type, id] = ref.includes(':') ? ref.split(/:(.*)/s) : [undefined, ref];
  invariant(!type || SOURCE_KINDS.includes(type), 'INVALID_OPTION', 'source supports: ' + SOURCE_KINDS.join(', '));
  let found;
  for (const kind of type ? [type] : SOURCE_KINDS) {
    const record = recordsOf(sources, kind).find(item => item.id === id);
    if (record) { found = { kind, record }; break; }
  }
  invariant(found, 'NOT_FOUND', `No external record named ${ref}. Run genlib find first.`);
  const { kind, record } = found;
  // Skills keep their commit-pinned tree URL in `url`; other records use `repository`.
  const repository = record.repository ?? record.source ?? (record.url?.includes('/tree/') ? record.url : undefined);
  invariant(typeof repository === 'string' && repository.startsWith('https://'), 'NOT_FOUND', `${kind}:${id} has no public repository; use its install command or docs instead.`);
  const plan = sourceCommands({ repository, commit: record.commit, path: path ?? (kind === 'skill' ? record.path : undefined) });
  const license = typeof record.license === 'string' ? record.license : record.license?.id ?? null;
  const review = record['license-review'] || record.integrationMode === 'license-review' || record.redistributable === false || !license;
  const equivalents = (await loadEquivalents(sources.root))[`${kind}:${id}`] ?? [];
  return {
    ref: `${kind}:${id}`, name: record.name ?? id, ...plan, license,
    note: review
      ? 'License review: read the license before copying any code; prefer installing the published package or linking to it.'
      : 'Keep the license notice with anything you copy, and record the commit.',
    ...(equivalents.length ? { equivalents } : {}),
  };
}

let equivalentsCache;
export async function loadEquivalents(root) {
  if (!equivalentsCache) {
    const data = parseJson(await readRegular(root, 'resources/equivalents.json', 256 * 1024), 'equivalents');
    invariant(data && data.schemaVersion === 1 && data.equivalents && typeof data.equivalents === 'object', 'INVALID_CATALOG', 'Invalid equivalents map.');
    equivalentsCache = data.equivalents;
  }
  return equivalentsCache;
}

export function formatSource(plan) {
  return [`${plan.ref}  ${plan.name}  [${plan.license ?? 'no license found'}]`, ...plan.fetch.map(step => '  ' + step),
    ...(plan.raw ? ['# one file: ' + plan.raw] : []),
    ...(plan.equivalents ? ['# genlib already has: ' + plan.equivalents.join(' ')] : []),
    '# ' + plan.note].join('\n');
}
