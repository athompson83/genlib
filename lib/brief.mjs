// Compact views of find results for agents: each result keeps its identity, a short title, its
// languages and only the commands that act (install, copy, add, read a section). Inspect and plan
// commands, documentation links and long summaries stay available through --json.
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
    next: actionCommands(result.next),
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
export function quickPick(found) {
  const [best, ...rest] = found.results;
  if (!best) return { query: found.query, best: null, next: [], alternatives: [], hint: 'No match. Try other words or genlib find --type <source type>.' };
  const brief = briefResult(best);
  return {
    query: found.query, best: `${brief.type}:${brief.id}`, title: brief.title,
    ...(brief.languages ? { languages: brief.languages } : {}), ...(brief.review ? { review: brief.review } : {}),
    next: brief.next, alternatives: rest.slice(0, 3).map(result => `${result.type}:${result.id}`),
    ...(CODE.has(best.type) ? { outline: `node "$GENLIB_ROOT"/bin/genlib.mjs outline ${best.type}:${best.id}${best.selected?.language ? ' --language ' + best.selected.language : ''}` } : {}),
  };
}

export function formatQuick(pick) {
  if (!pick.best) return pick.hint;
  return [`${pick.best}  ${pick.title}${pick.review ? '  [license-review]' : ''}`, ...pick.next.map(command => '  ' + command),
    ...(pick.outline ? ['# api: ' + pick.outline] : []),
    ...(pick.alternatives.length ? ['# also: ' + pick.alternatives.join(' ')] : [])].join('\n');
}
