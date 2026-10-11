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

// The same adoption path as commandsFor, as ordered steps an agent can execute and check:
// {kind: copy|install|integrate|test|check, run?, cwd, purpose}. A test step is emitted only where the copied
// files run on their own (Python, Go, Java, Kotlin); elsewhere a compile check plus an integrate step say what
// the project must do. `verify` names the acceptance step, `onFailure` the first things to check.
export function stepsFor(impl, target = '"$APP_ROOT"', cli = '"$GENLIB_ROOT"/') {
  const app = { cwd: target };
  if (impl.kind === 'recipe') {
    const file = recipePath(impl.id);
    return {
      steps: [
        { kind: 'copy', run: `node ${cli}tools/recipe-install.mjs add ${impl.id} --target ${target}`, ...app, purpose: 'Copy the single-file recipe to genlib/' + (file ? file.split('/').pop() : '<recipe>') + ' (refuses to overwrite).' },
        { kind: 'integrate', ...app, purpose: 'Import it from your code; it has no imports of its own and needs no package.' },
        { kind: 'check', run: 'npx tsc --noEmit', ...app, purpose: 'Typecheck the project with the recipe in place.' },
      ],
      verify: 'check',
      onFailure: ['Strict-mode errors: the recipe targets TypeScript strict with web globals; add "DOM" or "WebWorker" to lib if crypto/TextEncoder are missing.', 'Read the recipe header for behavior that differs from other languages.'],
    };
  }
  if (impl.kind === 'module') {
    return {
      steps: [
        { kind: 'copy', run: `node ${cli}bin/genlib.mjs add ${impl.id} --target ${target} --json`, ...app, purpose: 'Install the module files with integrity hashes and a lock entry (refuses overwrites and incompatible targets).' },
        { kind: 'integrate', ...app, purpose: `Wire the configuration points listed by: node ${cli}bin/genlib.mjs inspect ${impl.id}` },
        { kind: 'check', run: `node ${cli}bin/genlib.mjs verify --target ${target}`, ...app, purpose: 'Confirm installed files still match their recorded hashes.' },
      ],
      verify: 'check',
      onFailure: ['INCOMPATIBLE_TARGET: compare the module compatibility with your framework and language.', 'Drift: a copied file was edited; re-plan or record the local change.'],
    };
  }
  if (impl.kind !== 'language-example') return { steps: [{ kind: 'integrate', ...app, purpose: impl.note }], verify: null, onFailure: [] };
  const flat = impl.id.startsWith('python-');
  const module = languageModule(impl.id);
  if (!module) return { steps: commandsFor(impl, target, cli).map(run => ({ kind: 'copy', run, ...app, purpose: 'Copy the implementation.' })), verify: null, onFailure: [] };
  const layout = copyLayout(module, { flat, includeTests: true });
  const steps = [{ kind: 'copy', run: `node ${cli}tools/language-modules.mjs add ${impl.id} --target ${target} --with-tests${flat ? ' --flat' : ''}`, ...app,
    purpose: 'Copy ' + layout.paths.map(layout.rel).join(', ') + ' (refuses to overwrite).' }];
  for (const step of scopedDependencies(module, layout)) {
    steps.push({ kind: 'install', run: step.command, cwd: step.cwd === '.' ? target : `${target}/${step.cwd}`, purpose: 'Install the pinned dependency this implementation needs.' });
  }
  const sources = module.files.filter(path => !/(Cargo\.(toml|lock)|Package\.swift|pubspec\.yaml|requirements\.txt|go\.mod|go\.sum)$/.test(path));
  const test = testStep(module, layout) ?? jvmTest(module, layout);
  if (test) {
    steps.push({ kind: 'test', run: test, ...app, purpose: 'Run the copied tests; they check the shared vectors.' });
    return { steps, verify: 'test', onFailure: [
      'A vector mismatch means the copy was edited or a dependency version differs from the one pinned; diff against the Genlib source.',
      'Missing toolchain: install the runtime named in "runtime" (' + module.runtime + ').',
    ] };
  }
  const integrate = {
    rust: `Move ${sources.map(layout.rel).join(', ')} into your crate's src/ and declare each as a module (mod name;); the tests are inline.`,
    csharp: `Add ${sources.map(layout.rel).join(', ')} to your project; ${layout.rel(module.tests[0] ?? '')} is the Genlib check harness to copy cases from, not a file to keep.`,
    dart: `Keep ${sources.map(layout.rel).join(', ')} in your package's lib/ and merge any dependency into your pubspec; the copied test files show the cases.`,
    swift: `Add ${sources.map(layout.rel).join(', ')} to one of your targets; the Checks file shows the cases to port into XCTest.`,
  }[module.language] ?? 'Add the copied source files to your build.';
  const check = { rust: 'cargo test', csharp: 'dotnet build', dart: 'dart analyze', swift: 'swift build' }[module.language];
  steps.push({ kind: 'integrate', ...app, purpose: integrate });
  if (check) steps.push({ kind: 'check', run: check, ...app, purpose: 'Build (and for Rust, run the inline tests) with the code integrated.' });
  return { steps, verify: check ? 'check' : null, onFailure: ['Port the copied test cases into your test runner; they encode the shared vectors.', 'Runtime: ' + module.runtime + '.'] };
}

// Java and Kotlin test classes have a main method, so the copied files compile and run on their own.
function jvmTest(module, layout) {
  const test = module.tests.find(path => /Test\.(java|kt)$/.test(path));
  if (!test || !['java', 'kotlin'].includes(module.language)) return null;
  const dir = layout.folder(test);
  const names = [...module.files, test].map(path => path.split('/').pop()).join(' ');
  const main = test.split('/').pop().replace(/\.(java|kt)$/, module.language === 'kotlin' ? 'Kt' : '');
  return module.language === 'java'
    ? `cd ${dir} && out=$(mktemp -d) && javac --release 17 -d "$out" ${names} && java -cp "$out" ${main}`
    : `cd ${dir} && out=$(mktemp -d) && kotlinc ${names} -include-runtime -d "$out/t.jar" && java -cp "$out/t.jar" ${main}`;
}

let recipes;
const recipePath = id => (recipes ??= new Map(JSON.parse(readFileSync(ROOT + 'resources/agent-recipes.json', 'utf8')).entries.map(entry => [entry.id, entry.path]))).get(id);

export function coverage(capability) {
  const available = LANGUAGES.filter(language => capability.implementations[language] && capability.implementations[language].kind !== 'unavailable');
  return { available, missing: LANGUAGES.filter(language => !available.includes(language)) };
}
