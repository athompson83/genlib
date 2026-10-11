# SPDX-License-Identifier: Apache-2.0
"""Run the actual recipe and behavior checks in a disposable checkout."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parent
def run(directory, *args):
    subprocess.run(args, cwd=directory, check=True)
def sources(directory):
    return {p.relative_to(directory).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (directory / 'src').rglob('*.java')}
def behavior(directory):
    run(directory, 'mvn', '-q', 'clean', 'test-compile')
    run(directory, 'java', '-cp', os.pathsep.join(['target/classes', 'target/test-classes']), 'fixture.LabelBehavior')

with tempfile.TemporaryDirectory(prefix='genlib-rewrite-') as tmp:
    fixture = Path(tmp) / 'fixture'
    shutil.copytree(root, fixture, ignore=shutil.ignore_patterns('target', '__pycache__'))
    behavior(fixture)
    run(fixture, 'mvn', '-q', 'rewrite:run')
    expected = fixture / 'src/main/java/app/inventory/Label.java'
    if not expected.is_file() or 'package app.inventory;' not in expected.read_text():
        raise AssertionError('The declared package migration did not occur')
    if (fixture / 'src/main/java/legacy/inventory/Label.java').exists():
        raise AssertionError('Legacy source unexpectedly remains')
    behavior(fixture)
    after = sources(fixture)
    run(fixture, 'mvn', '-q', 'rewrite:run')
    if sources(fixture) != after:
        raise AssertionError('A second recipe application changed the source')
    behavior(fixture)
print('OpenRewrite package migration, behavior and idempotence passed')
