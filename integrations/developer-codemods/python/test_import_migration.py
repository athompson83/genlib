# SPDX-License-Identifier: Apache-2.0
import unittest
from import_migration import migrate

class MigrationTests(unittest.TestCase):
    def test_exact_from_import_comments_alias_and_repeat(self):
        source = '# comment\nfrom legacy.client import (\n    Client as API,  # alias\n)\ntext = "legacy.client"\n'
        result = migrate(source, 'legacy.client', 'app.client')
        self.assertEqual(result, source.replace('from legacy.client', 'from app.client'))
        self.assertEqual(migrate(result, 'legacy.client', 'app.client'), result)
        compile(result, '<migrated>', 'exec')
    def test_relative_and_plain_imports_are_not_rewritten(self):
        source = 'from .legacy.client import Client\nimport legacy.client\n'
        self.assertEqual(migrate(source, 'legacy.client', 'app.client'), source)
    def test_invalid_module_rejected(self):
        with self.assertRaises(ValueError): migrate('x = 1', 'old', 'new; bad()')

if __name__ == '__main__': unittest.main()
