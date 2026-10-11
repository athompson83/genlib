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
  return Boolean(best) && (found.terms?.length ?? 0) >= 2 && !OWN.has(best.type) && (best.coverage ?? 1) < NO_MATCH_COVERAGE;
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
export function quickPick(found, { contracts } = {}) {
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

// The size of what a copy brings, from the outline's file list, so an agent can compare it with what it would
// write itself: small code is cheaper to write than to find, copy and adapt (docs/benchmarks.md round 6).
export async function withSize(pick, outlineFn) {
  if (!pick.outline || !pick.best) return pick;
  try {
    const [, ref] = /outline (\S+)/.exec(pick.outline) ?? [];
    const language = /--language (\w+)/.exec(pick.outline)?.[1];
    const result = await outlineFn(ref, language);
    return { ...pick, size: { lines: result.files.reduce((sum, file) => sum + file.lines, 0), files: result.files.length } };
  } catch { return pick; }
}

export function formatQuick(pick) {
  if (!pick.best) return ['# no match: ' + pick.hint, ...(pick.weak ? ['# weak word matches: ' + pick.weak.join(' ')] : []), ...(pick.fallback ?? []).map(command => '  ' + command)].join('\n');
  return [`${pick.best}  ${pick.title}${[pick.fit, pick.review && 'license-review'].filter(Boolean).map(tag => `  [${tag}]`).join('')}`, ...pick.next.map(command => '  ' + command),
    ...(pick.outline ? ['# api: ' + pick.outline + (pick.size ? `  (${pick.size.lines} lines in ${pick.size.files} file${pick.size.files === 1 ? '' : 's'})` : '')] : []),
    // A known limit is cheaper to read now than to discover after copying the code.
    ...(pick.caveat ? ['# caveat: ' + pick.caveat] : []),
    ...(pick.covers ? ['# covers: ' + coversLine(pick.covers)] : []),
    ...(pick.alternatives.length ? ['# also: ' + pick.alternatives.join(' ')] : [])].join('\n');
}
