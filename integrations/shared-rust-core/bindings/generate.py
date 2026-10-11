# SPDX-License-Identifier: Apache-2.0
"""Explicit local generation; no installer hook. Never edits an app project."""
from pathlib import Path
import argparse
import json
import os
import platform
import shutil
import subprocess
root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('language', choices=['python', 'swift', 'kotlin'])
args = parser.parse_args()
library = {'Linux': 'libgenlib_inventory_core.so', 'Darwin': 'libgenlib_inventory_core.dylib', 'Windows': 'genlib_inventory_core.dll'}.get(platform.system())
if library is None: raise SystemExit('Unsupported host platform')
if os.environ.get('CARGO_BUILD_TARGET'):
    raise SystemExit('This profile generates and tests host bindings; clear CARGO_BUILD_TARGET and package cross-compiled ABIs separately.')
metadata = json.loads(subprocess.check_output(['cargo', 'metadata', '--format-version=1', '--no-deps'], cwd=root, text=True))
compiled_library = Path(metadata['target_directory']) / 'debug' / library
subprocess.run(['cargo', 'build', '--locked', '--lib'], cwd=root, check=True)
output = root / 'generated' / args.language
output.mkdir(parents=True, exist_ok=True)
subprocess.run(['cargo', 'run', '--locked', '--features=uniffi/cli', '--bin', 'uniffi-bindgen', '--', 'generate', '--library', str(compiled_library), '--language', args.language, '--no-format', '--out-dir', str(output)], cwd=root, check=True)
if args.language == 'python': shutil.copy2(compiled_library, output / library)
print('Generated', args.language, 'bindings at', output)
