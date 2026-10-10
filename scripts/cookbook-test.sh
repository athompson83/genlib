#!/usr/bin/env bash
# Runs every examples/cookbook/<topic>/<language>/ test for one language, using that
# directory's pinned manifest. Usage: scripts/cookbook-test.sh <language> [topic...]
set -euo pipefail
language="${1:?usage: scripts/cookbook-test.sh <language> [topic...]}"
shift
root="$(cd "$(dirname "$0")/.." && pwd)"
topics=("$@")
if [ ${#topics[@]} -eq 0 ]; then
  for dir in "$root"/examples/cookbook/*/"$language"; do [ -d "$dir" ] && topics+=("$(basename "$(dirname "$dir")")"); done
fi
failed=()
for topic in "${topics[@]}"; do
  dir="$root/examples/cookbook/$topic/$language"
  [ -d "$dir" ] || { echo "skip $topic/$language (not available)"; continue; }
  scratch="$(mktemp -d)"
  work="$scratch/$language"
  # Test a copy so builds never write into the repository; shared ../fixtures keep their relative path.
  mkdir -p "$work" && cp -R "$dir"/. "$work"/
  if [ -d "$root/examples/cookbook/$topic/fixtures" ]; then cp -R "$root/examples/cookbook/$topic/fixtures" "$scratch/fixtures"; fi
  echo "::group::$topic/$language"
  if (
    cd "$work"
    case "$language" in
      typescript) npm ci --no-audit --no-fund && npm test ;;
      python) python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt && { [ ! -f requirements-dev.txt ] || .venv/bin/pip install -q -r requirements-dev.txt; } && .venv/bin/python -m unittest discover -v ;;
      go) go vet ./... && go test ./... ;;
      rust) cargo test --locked ;;
      java|kotlin) mvn -q -B test ;;
      csharp) if grep -q Microsoft.NET.Test.Sdk ./*.csproj; then dotnet test; else dotnet run; fi ;;
      dart) dart pub get && dart test ;;
      swift) if [ -d Tests ]; then swift test; else swift build; fi ;;
      *) echo "unknown language $language"; exit 2 ;;
    esac
  ); then echo "ok $topic/$language"; else failed+=("$topic/$language"); fi
  echo "::endgroup::"
  rm -rf "$scratch"
done
if [ ${#failed[@]} -gt 0 ]; then echo "failed: ${failed[*]}"; exit 1; fi
