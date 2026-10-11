import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { copyLayout, scopedDependencies, testStep } from './language-layout.mjs';
import { invariant, object, parseJson, readRegular, rootDirectory } from './safety.mjs';

// Cross-language capability index: one entry per capability (TOTP, OIDC/PKCE, PDF filling, ...)
// mapping each language to the Genlib code that implements it and the command that copies it.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const LANGUAGES = ['typescript', 'python', 'go', 'rust', 'java', 'kotlin', 'csharp', 'dart', 'swift'];
const KINDS = ['recipe', 'language-example', 'module', 'unavailable'];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit;

export function validateCapability(capability) {
  invariant(object(capability) && text(capability.id, 80) && ID.test(capability.id) && text(capability.title, 120), 'INVALID_CAPABILITY', 'Invalid capability identity.');
  const fail = 'Invalid capability: ' + capability.id;
  invariant(['pure', 'library'].includes(capability.tier) && text(capability.summary, 600), 'INVALID_CAPABILITY', fail);
  invariant(Array.isArray(capability.terms) && capability.terms.every(term => text(term, 60)), 'INVALID_CAPABILITY', fail);
  invariant(text(capability.guide, 200) && capability.guide.startsWith('docs/') && capability.guide.endsWith('.md'), 'INVALID_CAPABILITY', fail);
  invariant(object(capability.implementations), 'INVALID_CAPABILITY', fail);
  for (const [language, impl] of Object.entries(capability.implementations)) {
    invariant(LANGUAGES.includes(language) && object(impl) && KINDS.includes(impl.kind), 'INVALID_CAPABILITY', `${fail} (${language})`);
    invariant(impl.kind === 'unavailable' ? text(impl.note, 600) : text(impl.id, 120) && typeof impl.tested === 'boolean', 'INVALID_CAPABILITY', `${fail} (${language})`);
  }
  return capability;
}

export async function loadCapabilities(repositoryRoot = ROOT) {
  const root = await rootDirectory(repositoryRoot);
  const data = parseJson(await readRegular(root, 'resources/capabilities.json', 1024 * 1024), 'capabilities');
  invariant(object(data) && data.schemaVersion === 1 && Array.isArray(data.capabilities), 'INVALID_CAPABILITY', 'Invalid capability index.');
  const ids = new Set();
  for (const capability of data.capabilities) {
    validateCapability(capability);
    invariant(!ids.has(capability.id), 'INVALID_CAPABILITY', 'Duplicate capability: ' + capability.id);
    ids.add(capability.id);
  }
  return data;
}

let modules;
const languageModule = id => (modules ??= new Map(JSON.parse(readFileSync(ROOT + 'examples/languages/modules.json', 'utf8')).modules.map(module => [module.id, module]))).get(id);

// Exact copy commands for one language's implementation.
export function commandsFor(impl, target = '"$APP_ROOT"', cli = '"$GENLIB_ROOT"/') {
  if (impl.kind === 'recipe') return [`node ${cli}tools/recipe-install.mjs add ${impl.id} --target ${target}`];
  if (impl.kind === 'language-example') {
    // Dependency steps are scoped to where this exact copy command puts the module's manifest.
    const flat = impl.id.startsWith('python-');
    const module = languageModule(impl.id);
    const layout = module && copyLayout(module, { flat, includeTests: true });
    const deps = module ? scopedDependencies(module, layout).map(step => step.command) : (impl.dependencies ?? []);
    // Order: copy, dependencies, then tests. Without dependencies the copy can run the tests itself (--run-tests);
    // with them, the tests run as the last step, once the dependencies are installed.
    const runNow = /^(?:python|go)-/.test(impl.id) && !deps.length;
    const verify = deps.length && module ? testStep(module, layout) : null;
    return [`node ${cli}tools/language-modules.mjs add ${impl.id} --target ${target} --with-tests${flat ? ' --flat' : ''}${runNow ? ' --run-tests' : ''}`, ...deps, ...(verify ? [verify] : [])];
  }
  if (impl.kind === 'module') return [`node ${cli}bin/genlib.mjs add ${impl.id} --target ${target} --json`];
  return [impl.note];
}

export function coverage(capability) {
  const available = LANGUAGES.filter(language => capability.implementations[language] && capability.implementations[language].kind !== 'unavailable');
  return { available, missing: LANGUAGES.filter(language => !available.includes(language)) };
}
