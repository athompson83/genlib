// Where a language module's files land when copied, and the dependency and test steps that follow from that
// layout. Shared by tools/language-modules.mjs (the copy itself) and capability commands (quick, find, inspect), so
// the commands an agent is shown always run in the folder that holds the copied manifest.
const PRIMARY = /^(requirements\.txt|package\.json|go\.mod|Cargo\.toml|.*\.csproj|pubspec\.yaml|Package\.swift|pom\.xml|build\.gradle\.kts)$/;
// Commands that read a manifest in the current folder; package-add commands (npm install x@1, go get, cargo add,
// dotnet add, dart pub add) instead add to the receiving app's own manifest at its root.
const MANIFEST_RELATIVE = /^(npm ci\b|npm install$|pnpm install$|yarn install$|pip3? install -r |python3? -m pip install -r |cargo (build|fetch)\b|dotnet restore\b|dart pub get\b|flutter pub get\b|go mod download\b|swift package resolve\b)/;

export function copyLayout(module, { flat = false, into, includeTests = false } = {}) {
  const dir = into ?? (flat ? '.' : 'genlib');
  const prefix = dir === '.' ? '' : dir.replace(/\/+$/, '') + '/';
  const paths = [...module.files, ...(includeTests ? module.tests : [])];
  const dirs = paths.map(path => path.split('/').slice(0, -1));
  let common = dirs[0] ?? [];
  for (const d of dirs) { let i = 0; while (i < common.length && i < d.length && common[i] === d[i]) i++; common = common.slice(0, i); }
  const rel = path => prefix + (flat ? path.split('/').slice(common.length).join('/') : path);
  const manifest = paths.find(path => PRIMARY.test(path.split('/').pop()));
  const folder = path => { const parts = rel(path).split('/'); parts.pop(); return parts.join('/') || '.'; };
  return { paths, rel, manifestDir: manifest ? folder(manifest) : null, manifestName: manifest?.split('/').pop() ?? null, folder };
}

// Dependency commands scoped to the folder that holds the copied manifest. When that manifest was not copied
// (the app already had one and its lines were reported for merging), commands run at the app root.
export function scopedDependencies(module, layout, { manifestCopied = true } = {}) {
  return (module.dependencies ?? []).map(command => {
    if (!MANIFEST_RELATIVE.test(command) || !manifestCopied || !layout.manifestDir || layout.manifestDir === '.') return { command, cwd: '.' };
    return { command: `cd ${layout.manifestDir} && ${command}`, cwd: layout.manifestDir, argv: command.split(' ') };
  });
}

// The test step for a copied module, run after dependencies: Python from the test's folder, Go from its own module
// folder when a go.mod was copied. Other languages use the project's test runner (null here).
export function testStep(module, layout) {
  const tests = module.tests.filter(path => /(^|\/)(test_[^/]*\.py|[^/]*_test\.go)$/.test(path));
  if (!tests.length) return null;
  if (module.language === 'python') return `cd ${layout.folder(tests[0])} && python3 -m unittest ${tests.map(path => path.split('/').pop().replace(/\.py$/, '')).join(' ')}`;
  if (module.language === 'go') return layout.manifestName === 'go.mod' ? `cd ${layout.manifestDir} && go test ./...` : `go test ./${layout.folder(tests[0])}`;
  return null;
}
