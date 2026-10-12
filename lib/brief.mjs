// Compact views of find results for agents: each result keeps its identity, a short title, its
// languages and only the commands that act (install, copy, add, read a section). Inspect and plan
// commands, documentation links and long summaries stay available through --json.
import { refCoverage } from './coverage.mjs';

const PASSIVE = /(?:\s(?:inspect|plan)\s|^Docs: |^Review first: |^License review required|^Read [\w./-]+\.md$)/;
const CODE = new Set(['capability', 'module', 'recipe', 'language-example']);
const MAX_TITLE = 72;

export function actionCommands(next = []) {
  const acting = next.filter(command => !PASSIVE.test(command));
  return (acting.length ? acting : next).slice(0, 3);
}

export function briefResult(result) {
  const title = String(result.title ?? result.id);
  // A capability's command already targets one language, so name that one instead of all nine.
  const languages = result.selected?.language ? [result.selected.language] : (result.languages ?? []).filter(language => language !== 'any');
  const review = result.integrationMode === 'license-review' || (result.next ?? []).some(command => command.startsWith('License review required'));
  return {
    type: result.type, id: result.id, title: title.length > MAX_TITLE ? title.slice(0, MAX_TITLE - 1) + '…' : title,
    ...(languages.length ? { languages: languages.slice(0, 4) } : {}),
    ...(result.fit && result.fit !== 'compatible' ? { fit: result.fit } : {}),
    ...(review ? { review: 'license' } : {}),
    ...(result.caveat ? { caveat: result.caveat } : {}),
    // A result that needs review keeps its plan step instead of a direct add, so the qualification is not lost.
    next: result.fit && result.fit !== 'compatible' ? actionCommands((result.next ?? []).filter(command => !/\s(add)\s/.test(command)).map(command => command.replace(/\s(plan)\s/, ' plan '))).concat((result.next ?? []).filter(command => /\splan\s/.test(command))).filter((command, index, all) => all.indexOf(command) === index).slice(0, 3) : actionCommands(result.next),
  };
}

export function briefFind(found) {
  return {
    query: found.query, results: found.results.map(briefResult),
    ...(found.hiddenIncompatible ? { hiddenIncompatible: found.hiddenIncompatible } : {}),
    more: 'Add --json for full records, or run genlib outline <id> for signatures.',
  };
}

// Plain text: one header line and its commands per result.
export function formatBrief(brief) {
  const lines = [];
  brief.results.forEach((result, index) => {
    const tags = [result.languages?.join(','), result.fit, result.review && 'license-review'].filter(Boolean).join(' ');
    lines.push(`${index + 1}. ${result.type}:${result.id}  ${result.title}${tags ? `  [${tags}]` : ''}`);
    for (const command of result.next) lines.push('   ' + command);
    if (result.caveat) lines.push('   # caveat: ' + result.caveat);
  });
  if (!brief.results.length) lines.push('No match. Try other words, --type <source type>, or genlib catalog.');
  if (brief.hiddenIncompatible) lines.push(`(${brief.hiddenIncompatible} results for other languages hidden)`);
  lines.push('# ' + brief.more);
  return lines.join('\n');
}

// Index lookups (skill, mcp, cli, api, starter, task find): one line and the install steps per hit.
export function formatIndexHits(kind, hits) {
  if (!hits.length) return `No ${kind} matched. Try other words or genlib find <task>.`;
  const lines = [];
  hits.forEach((hit, index) => {
    const tags = [hit.kind, (hit.languages ?? []).slice(0, 3).join(','), hit['license-review'] || hit.redistributable === false ? 'license-review' : ''].filter(Boolean).join(' ');
    const title = String(hit.title ?? hit.name ?? hit.id);
    lines.push(`${index + 1}. ${kind}:${hit.id}  ${title.length > MAX_TITLE ? title.slice(0, MAX_TITLE - 1) + '…' : title}${tags ? `  [${tags}]` : ''}`);
    for (const step of [hit.install].flat().filter(Boolean).slice(0, 2)) lines.push('   ' + String(step).split('\n')[0] + (String(step).includes('\n') ? ' …' : ''));
  });
  lines.push(`# Full records: add --json, or genlib ${kind} inspect <id>.`);
  return lines.join('\n');
}

// One-shot: the best match's commands plus a few alternatives by reference only.
// A best result that matches under a third of a multi-word task, and is not Genlib's own code (which can be
// reached through reviewed synonyms), is an incidental word hit: answer "no match" with search fallbacks.
const OWN = new Set(['capability', 'module', 'integration', 'recipe', 'language-example', 'template', 'tool', 'doc']);
export const NO_MATCH_COVERAGE = 0.34;
export function isWeak(found) {
  const best = found.results[0];
  return Boolean(best) && (found.terms?.length ?? 0) >= 2 && (best.coverage ?? 1) < NO_MATCH_COVERAGE;
}

function noMatch(found, weak) {
  const words = (found.terms ?? []).join(' ');
  return {
    query: found.query, best: null, status: 'no-match', next: [], alternatives: [],
    ...(weak.length ? { weak: weak.map(result => `${result.type}:${result.id}`) } : {}),
    hint: 'Nothing in Genlib fits this task. Try other words, or search outside the catalog (unreviewed: check license, maintenance and tests before reusing anything).',
    fallback: [
      `node "$GENLIB_ROOT"/bin/genlib.mjs find ${JSON.stringify(found.query)} --limit 8`,
      `gh search repos ${JSON.stringify(words)} --license mit --license apache-2.0 --license bsd-3-clause --sort stars --limit 5`,
      `gh search code ${JSON.stringify(words)} --limit 10`,
    ],
  };
}

// `contracts` (from lib/coverage.mjs loadContracts) adds what the pick verifiably covers of the feature, so the
// caller can decide use, adapt or skip without a follow-up outline or coverage call.
// A task worded as an edit to existing code ("rename the submit button", "increase the page size from 20 to 50")
// is cheaper to make directly than to look up; quick says so instead of offering an incidental match.
const EDIT_VERB = /^(?:please\s+)?(?:rename|change|fix|update|move|remove|delete|increase|decrease|bump|reorder|hide|tweak|adjust|swap|replace|log)\s|^(?:please\s+)?(?:make|show)\s+the\b|^(?:please\s+)?return\s+\d{3}\b/i;
const EXISTING = /\b(?:the|each|every|our|existing|current)\b|\bfrom\s+\S+\s+to\b|'s\b/i;
const SMALL_ADD = /^(?:please\s+)?add\s+(?:a|an|the)\s+(?:[\w-]+\s+){0,2}(?:field|column|tooltip|badge|label|link|button|icon|placeholder|option|toggle|filter|sort)\b/i;
export function isSmallEdit(query) {
  const text = String(query ?? '').trim();
  return (EDIT_VERB.test(text) && EXISTING.test(text)) || SMALL_ADD.test(text) || /^(?:please\s+)?return\s+\d{3}\s+instead\b/i.test(text);
}

function smallEdit(found) {
  return { query: found.query, best: null, status: 'small-edit', next: [], alternatives: [],
    hint: 'This reads as a small change to existing code: make it directly; a library lookup costs more than the edit.' };
}

export function quickPick(found, { contracts } = {}) {
  if (isSmallEdit(found.query)) return smallEdit(found);
  if (!found.results.length) return noMatch(found, []);
  if (isWeak(found)) {
    // A weak top hit (one incidental word) yields to a near-top result that covers the task.
    const covering = found.results.slice(1, 4).find(result => (result.coverage ?? 0) >= NO_MATCH_COVERAGE * 2);
    if (!covering) return noMatch(found, found.results.slice(0, 3));
    found = { ...found, results: [covering, ...found.results.filter(result => result !== covering)] };
  }
  const [best, ...rest] = found.results;
  const brief = briefResult(best);
  const covers = contracts ? refCoverage(contracts, `${best.type}:${best.id}`, found.query) : null;
  return {
    query: found.query, best: `${brief.type}:${brief.id}`, title: brief.title,
    ...(brief.languages ? { languages: brief.languages } : {}), ...(brief.fit ? { fit: brief.fit } : {}), ...(brief.review ? { review: brief.review } : {}), ...(brief.caveat ? { caveat: brief.caveat } : {}),
    ...(covers ? { covers } : {}),
    // direct: tests verify every requirement of the asked feature; partial: the app must add some, or a caveat applies.
    ...(covers ? { reuse: !covers.missing.length && !brief.caveat ? 'direct' : 'partial' } : {}),
    next: brief.next, alternatives: rest.slice(0, 3).map(result => `${result.type}:${result.id}`),
    ...(CODE.has(best.type) ? { outline: `node "$GENLIB_ROOT"/bin/genlib.mjs outline ${best.type}:${best.id}${best.selected?.language ? ' --language ' + best.selected.language : ''}` } : {}),
  };
}

// "8/8 of email-verification-signup" or "3/8 of totp-two-factor; app must add: a, b, c +2".
export function coversLine(covers) {
  const shown = covers.missing.slice(0, 3);
  const more = covers.missing.length - shown.length;
  return `${covers.verified} of ${covers.contract} verified by tests` + (shown.length ? `; app must add: ${shown.join(', ')}${more ? ` +${more}` : ''}` : '');
}

// One-call decision details for a code pick, composed from data Genlib already has: the outline (files, line
// counts, signatures) and, for a module, its manifest (install targets and the behavior it fixes, such as
// routes and status codes). With these an agent can decide use, adapt or write without an outline or contract
// read, which round 6 of docs/benchmarks.md measured as the extra turns that made reuse cost more.
const FUNCTION = /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)|^export\s+class\s+(\w+)|^(?:pub\s+)?(?:async\s+)?(?:def|fn|func)\s+(\w+)\s*\(([^)]*)\)|^(?:public\s+)?(?:static\s+)?[\w<>\[\],.? ]+\s+(\w+)\s*\(([^)]*)\)/;
const PREFERRED = /^(create|make|new|verify|sign|parse|issue|check|build|guard|run)/i;

function splitTop(text, separator = ',') {
  const parts = []; let depth = 0, current = '', quote = '';
  for (const char of text) {
    if (quote) { if (char === quote) quote = ''; }
    else if (char === '"' || char === "'" || char === '`') quote = char;
    else if ('([{<'.includes(char)) depth += 1;
    else if (')]}>'.includes(char)) depth -= 1;
    if (char === separator && depth === 0 && !quote) { parts.push(current); current = ''; } else current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** `createInvitations(options)` from a full signature: the name and parameter names only. */
export function compactSignature(signature) {
  const match = FUNCTION.exec(signature.trim());
  if (!match) return null;
  const name = match[1] ?? match[3] ?? match[4] ?? match[6];
  if (match[3]) return { name, text: name };
  const params = splitTop(match[2] ?? match[5] ?? match[7] ?? '').map(param => param.trim().replace(/^(?:readonly|mut)\s+/, '')).map(param => /^[{[]/.test(param) ? (param[0] === '{' ? '{…}' : '[…]') : param.split(/[:=\s?]/)[0]).filter(param => param && param !== 'self' && param !== '&self');
  return { name, text: `${name}(${params.join(', ')})` };
}

/** Required (non-optional) top-level fields of the first exported `...Options` interface: the hooks the app supplies. */
export function requiredHooks(declarations) {
  const options = declarations.find(item => /^export\s+(?:interface|type)\s+\w*Options\b/.test(item.signature));
  if (!options) return [];
  const body = options.signature.slice(options.signature.indexOf('{') + 1, options.signature.lastIndexOf('}'));
  return splitTop(body, ';').map(field => /^\s*(?:readonly\s+)?(\w+)(\?)?\s*:/.exec(field)).filter(match => match && !match[2]).map(match => match[1]);
}

export async function withDetails(pick, { outlineFn, moduleFn, out = 'src/genlib' } = {}) {
  if (!pick.outline || !pick.best) return pick;
  try {
    const [, ref] = /outline (\S+)/.exec(pick.outline) ?? [];
    const language = /--language (\w+)/.exec(pick.outline)?.[1];
    const result = await outlineFn(ref, language);
    const declarations = result.files.flatMap(file => file.declarations.map(item => ({ ...item, file: file.path })));
    const api = declarations.map(item => ({ ...compactSignature(item.signature), file: item.file })).filter(item => item.name)
      .sort((a, b) => Number(PREFERRED.test(b.name)) - Number(PREFERRED.test(a.name))).slice(0, 3);
    const details = { size: { lines: result.files.reduce((sum, file) => sum + file.lines, 0), files: result.files.length } };
    if (api.length) details.api = api.map(item => item.text);
    const hooks = requiredHooks(declarations);
    if (hooks.length) details.hooks = hooks.slice(0, 6);
    const [type, id] = result.ref.split(':');
    if (type === 'module' && moduleFn) {
      const manifest = await moduleFn(id);
      const targets = manifest.files.map(file => file.target);
      details.files = targets.map(target => `${out}/${target}`);
      const main = api[0] && manifest.files.find(file => api[0].file.endsWith(file.source));
      if (main) details.importFrom = `${out}/${main.target}`;
      if (manifest.decisions?.length) details.decisions = manifest.decisions;
      // Install profiles: name them instead of every file, and suggest the smallest useful set on the add command.
      if (manifest.profiles) {
        details.profiles = Object.keys(manifest.profiles);
        const suggested = ['core', 'memory', 'http'].filter(name => details.profiles.includes(name));
        if (suggested.includes('core') && suggested.length < details.profiles.length) {
          details.profile = suggested.join(',');
          details.next = pick.next.map(command => command.replace(` add ${id} `, ` add ${id} --profile ${details.profile} `));
        }
      }
      details.verify = `run the test command add prints, then genlib verify ${id} --target "$APP_ROOT"`;
    } else if (type === 'recipe') {
      details.files = result.files.map(file => 'genlib/' + file.path.split('/').pop());
      details.importFrom = details.files[0];
    }
    return { ...pick, ...details };
  } catch { return pick; }
}

// "src/genlib/x/{core.ts,http.ts}" for files that share a directory.
function compactPaths(paths) {
  const dirs = new Set(paths.map(item => item.slice(0, item.lastIndexOf('/'))));
  if (dirs.size !== 1 || paths.length === 1) return paths.join(', ');
  const [dir] = dirs;
  return `${dir}/{${paths.map(item => item.slice(dir.length + 1)).join(',')}}`;
}

export function formatQuick(pick) {
  if (pick.status === 'small-edit') return '# skip: ' + pick.hint;
  if (!pick.best) return ['# no match: ' + pick.hint, ...(pick.weak ? ['# weak word matches: ' + pick.weak.join(' ')] : []), ...(pick.fallback ?? []).map(command => '  ' + command)].join('\n');
  return [`${pick.best}  ${pick.title}${[pick.fit, pick.review && 'license-review'].filter(Boolean).map(tag => `  [${tag}]`).join('')}`, ...pick.next.map(command => '  ' + command),
    ...(pick.covers ? [`# reuse ${pick.reuse}: ` + coversLine(pick.covers)] : []),
    ...(pick.decisions ? ['# fixed: ' + pick.decisions.join('; ')] : []),
    ...(pick.size ? [`# size: ${pick.size.lines} lines in ${pick.size.files} file${pick.size.files === 1 ? '' : 's'}${pick.files && !pick.profiles ? ' -> ' + compactPaths(pick.files) : ''}`] : []),
    ...(pick.profiles ? ['# profiles: ' + pick.profiles.join(', ')] : []),
    ...(pick.api ? ['# api: ' + pick.api.join(' · ') + (pick.importFrom ? ` from ${pick.importFrom}` : '')] : pick.outline ? ['# api: ' + pick.outline] : []),
    ...(pick.hooks ? ['# needs: ' + pick.hooks.join(', ')] : []),
    ...(pick.verify ? ['# then: ' + pick.verify] : []),
    // A known limit is cheaper to read now than to discover after copying the code.
    ...(pick.caveat ? ['# caveat: ' + pick.caveat] : []),
    ...(pick.alternatives.length ? ['# also: ' + pick.alternatives.join(' ')] : [])].join('\n');
}
