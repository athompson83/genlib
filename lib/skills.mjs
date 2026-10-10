import { invariant, object, parseJson, readRegular, rootDirectory } from './safety.mjs';
import { fileURLToPath } from 'node:url';

// Index of third-party agent skills (Claude Code, Codex and other Agent Skills harnesses).
// Genlib stores metadata and a commit-pinned install command; it does not copy or run skill code.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SKILLS_CLI = 'skills@1.7.2';
export const HARNESSES = { claude: ['claude-code'], codex: ['codex'], both: ['claude-code', 'codex'] };
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMIT = /^[a-f0-9]{40}$/;
const text = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit;

export function validateSkill(skill) {
  invariant(object(skill) && text(skill.id, 100) && ID.test(skill.id) && text(skill.name, 120), 'INVALID_SKILL', 'Invalid skill identity.');
  const fail = 'Invalid skill record: ' + skill.id;
  invariant(typeof skill.description === 'string' && skill.description.length <= 600, 'INVALID_SKILL', fail);
  invariant(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(skill.source) && COMMIT.test(skill.commit), 'INVALID_SKILL', fail);
  invariant(typeof skill.path === 'string' && !skill.path.split('/').some(part => part === '..' || part === ''), 'INVALID_SKILL', fail);
  invariant(skill.url === `${skill.source}/tree/${skill.commit}/${skill.path}`, 'INVALID_SKILL', fail);
  invariant(skill.install === `npx skills add ${skill.url}`, 'INVALID_SKILL', fail);
  invariant(skill.license === null || text(skill.license, 60), 'INVALID_SKILL', fail);
  invariant(typeof skill.redistributable === 'boolean' && typeof skill.curated === 'boolean', 'INVALID_SKILL', fail);
  invariant(skill.rank === null || (Number.isSafeInteger(skill.rank) && skill.rank > 0), 'INVALID_SKILL', fail);
  return skill;
}

export async function loadSkills(repositoryRoot = ROOT) {
  const root = await rootDirectory(repositoryRoot);
  const index = parseJson(await readRegular(root, 'resources/skills.json', 4 * 1024 * 1024), 'skills');
  invariant(object(index) && index.schemaVersion === 1 && Array.isArray(index.skills) && index.skills.length <= 2000, 'INVALID_SKILL', 'Invalid skill index.');
  const ids = new Set();
  for (const skill of index.skills) {
    validateSkill(skill);
    invariant(!ids.has(skill.id), 'INVALID_SKILL', 'Duplicate skill: ' + skill.id);
    ids.add(skill.id);
  }
  return index;
}

// One command installs the pinned skill into the project for the selected harnesses, non-interactively.
export function installCommand(skill, harness = 'both') {
  invariant(Object.hasOwn(HARNESSES, harness), 'INVALID_OPTION', 'Harness must be claude, codex or both.');
  return `npx ${SKILLS_CLI} add ${skill.url} ${HARNESSES[harness].map(agent => '-a ' + agent).join(' ')} -y`;
}

export function skillSummary(skill, harness) {
  return {
    id: skill.id, name: skill.name, description: skill.description, rank: skill.rank, installs: skill.installs,
    license: skill.license, redistributable: skill.redistributable, source: skill.source, url: skill.url,
    install: installCommand(skill, harness),
  };
}

export function searchSkills(index, query, { limit = 8, harness = 'both' } = {}) {
  invariant(typeof query === 'string' && query.length <= 500, 'INVALID_OPTION', 'Query must have at most 500 characters.');
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= 50, 'INVALID_OPTION', 'Limit must be 1–50.');
  const words = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return index.skills
    .map(skill => {
      const label = (skill.id + ' ' + skill.name).toLowerCase(), body = skill.description.toLowerCase();
      const score = words.reduce((sum, word) => sum + (label.includes(word) ? 3 : 0) + (body.includes(word) ? 1 : 0), 0);
      return { skill, score };
    })
    .filter(hit => words.length === 0 || hit.score > 0)
    // Relevance first, then popularity (leaderboard rank; curated entries after ranked ones).
    .sort((a, b) => b.score - a.score || (a.skill.rank ?? 1e9) - (b.skill.rank ?? 1e9) || a.skill.id.localeCompare(b.skill.id))
    .slice(0, limit)
    .map(({ skill, score }) => ({ ...skillSummary(skill, harness), score }));
}
