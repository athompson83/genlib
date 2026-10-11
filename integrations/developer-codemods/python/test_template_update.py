# SPDX-License-Identifier: Apache-2.0
import shutil, subprocess, tempfile, unittest
from pathlib import Path
from copier import run_copy, run_update

ROOT = Path(__file__).resolve().parents[1]
def git(path, *args):
    subprocess.run(['git', '-C', str(path), *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
def init(path):
    git(path, 'init', '-q'); git(path, 'config', 'user.email', 'fixture@example.invalid'); git(path, 'config', 'user.name', 'Genlib Fixture')
def commit(path, title):
    git(path, 'add', '.'); git(path, 'commit', '-qm', title)

class TemplateUpgradeTests(unittest.TestCase):
    def test_pinned_template_upgrade_preserves_app_extension(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = Path(tmp)/'template', Path(tmp)/'app'
            shutil.copytree(ROOT/'copier/template', src)
            init(src); commit(src, 'v1'); git(src, 'tag', 'v1.0.0')
            run_copy(str(src), dst, data={'project_name':'Fixture'}, vcs_ref='v1.0.0', defaults=True, quiet=True)
            with (dst/'inventory.py').open('a') as output: output.write('\nCUSTOM_LABEL = "Keep me"\n')
            init(dst); commit(dst, 'App customization')
            (src/'project'/'repository.py').write_text('VERSION = 2\n')
            commit(src, 'v2'); git(src, 'tag', 'v2.0.0')
            run_update(dst, vcs_ref='v2.0.0', defaults=True, overwrite=True, quiet=True)
            self.assertIn('CUSTOM_LABEL = "Keep me"', (dst/'inventory.py').read_text())
            self.assertEqual((dst/'repository.py').read_text(), 'VERSION = 2\n')
            self.assertFalse(list(dst.rglob('*.rej')))

if __name__ == '__main__': unittest.main()
